const core = require('@actions/core');
const YAML = require('yaml');
const helm = require('./helm');
const config = require('./config');
const exec = require('@actions/exec');


function formatValue(key, value) {
    let retval = [];
    if (typeof value !== 'object') {
        retval.push(key + '=' + value);
    } else {
        Object.keys(value).forEach(k => {
            retval.push(formatValue(key + '.' + k, value[k]));
        });
    }
    return retval;
}

async function main() {
    try {
        let hc = new helm.Helm(process.env['HELM_VERSION'], process.env['RUNNER_TEMP']);
        let args = [];
        switch(config.input.action) {
        case 'install':
            args.push('upgrade');
            args.push('--install');
            args.push(config.input.release_name);

            if (config.input.repo_url) {
                if (config.input.repo_url.startsWith('oci:')) {
                    args.push(config.input.repo_url);
                } else {
                    args.push(config.input.chart_name);
                    args.push('--repo=' + config.input.repo_url);
                    if (config.input.repo_username) args.push('--username=' + config.input.repo_username);
                    if (config.input.repo_password) args.push('--password=' + config.input.repo_password);
                }
            } else {
                args.push(config.input.chart_path);
            }
            args.push('--create-namespace');
            if (config.input.value_file) args.push('--values=' + config.input.value_file);
            if (config.input.values) {
                const yaml = YAML.parse(config.input.values);
                Object.keys(yaml).forEach(k => {
                    formatValue(k, yaml[k]).forEach(v => {
                        args.push('--set');
                        args.push(v);
                    });
                });
            }
            if (config.input.wait) args.push('--wait');
            if (config.input.version) args.push('--version=' + config.input.version);
            if (config.input.timeout) args.push('--timeout=' + config.input.timeout);
            args.push('--output');
            args.push('json');
            break;
        case 'pull':
            args.push('pull');
            if (config.input.repo_url.startsWith('oci:')) {
                args.push(config.input.repo_url);
            } else {
                args.push(config.input.chart_name);
                args.push('--repo=' + config.input.repo_url);
                if (config.input.repo_username) args.push('--username=' + config.input.repo_username);
                if (config.input.repo_password) args.push('--password=' + config.input.repo_password);
            }
            if (config.input.version) args.push('--version=' + config.input.version);
            args.push('--untar');
            if (config.input.chart_path) args.push('--untardir=' + config.input.chart_path);
            break;
        case 'uninstall':
            args.push('uninstall');
            args.push(config.input.release_name);
            if (config.input.timeout) args.push('--timeout=' + config.input.timeout);
            break;
        default:
            throw new Error('Only install uninstall and pull are supported');
        }
        args.push('--namespace=' + config.input.namespace);
        if (config.input.dry_run) args.push('--dry-run');
        if (config.input.extra_vars) args.push(config.input.extra_vars);
        if (config.input.helm_opts) args.push(config.input.helm_opts);

        if (config.input.repo_url.startsWith('oci:')) {
            await hc.ecrLogin(
                config.input.repo_url.split('/')[2],
                config.input.repo_username,
                config.input.repo_password);
        }
        let output = '';
        if (config.input.action !== 'pull') {
            output = await hc.execute(
                ['status', config.input.release_name, '--output', 'json', '--namespace=' + config.input.namespace], true);
            if (output) {
                let release_status = JSON.parse(output);
                core.debug('Release ' + config.input.release_name + ' of chart ' + config.input.chart_name + ' is ' + release_status.info.status + ' at version ' + release_status.version);
                if (config.input.action === 'uninstall') {
                    if (release_status.info.status.startsWith('pending')) {
                        core.info('Release ' + config.input.release_name + 'of chart ' + config.input.chart_name + ' is is pending state. Cancelling');
                        return 0;
                    }
                } else {
                    switch(release_status.info.status) {
                    case 'deployed':
                        if (config.input.rollback_on_failure) args.push('--atomic');
                        break;
                    case 'pending-install':
                    case 'pending-upgrade':
                    case 'pending-rollback':
                        core.info('Release ' + config.input.release_name + 'of chart ' + config.input.chart_name + ' is is pending state. Cancelling');
                        return 0;
                    default:
                        core.info('[command]kubectl --namespace ' + config.input.namespace + ' delete secret sh.helm.release.v1.' + config.input.release_name + '.v' + release_status.version);
                        await exec.exec('kubectl', ['-n', config.input.namespace, 'delete', 'secret', 'sh.helm.release.v1.' + config.input.release_name + '.v' + release_status.version], {
                            ignoreReturnCode: true,
                            silent: true
                        });
                    }
                }
            } else {
                if (config.input.action === 'uninstall') {
                    core.info('Release ' + config.input.release_name + 'of chart ' + config.input.chart_name + ' not found. Nothing to do');
                    return 0;
                } else {
                    core.debug('Release ' + config.input.release_name + ' of chart ' + config.input.chart_name + ' not found');
                }
            }
        }
        output = await hc.execute(args);
        switch (config.input.action) {
        case 'install': {
            try {
                core.debug(output);
                const install_status = JSON.parse(output);
                core.notice('Helm chart ' + config.input.release_name + ' ' + install_status.namespace + '/' + config.input.chart_name + ': ' + install_status.info.description);
                core.setOutput('status', install_status.info.status);
                core.setOutput('revision', install_status.version);
                core.setOutput('first-deployed', install_status.info.first_deployed);
                core.setOutput('last-deployed', install_status.info.last_deployed);
            } catch (error) {
                core.warning('Helm chart ' + config.input.namespace + '/' + config.input.chart_name + ': Installation successful but unable to retrieve output. Error message: ' + error.message);
            }
            break;
        }
        case 'uninstall':
            core.notice('Helm chart ' + config.input.chart_name + ' -> ' + config.input.namespace + '/' + config.input.release_name + ': Uninstall complete');
            break;
        case 'pull':
            core.notice('Helm chart ' + config.input.chart_name + ' -> ' + config.input.namespace + '/' + config.input.release_name + ': Pull complete at ' + ((config.input.chart_path) ? config.input.chart_path : process.cwd()));
            break;
        default:
            core.info(output);
        }
    } catch (error) {
        core.setFailed(error.message);
        process.exit(1);
    }
}

main();
