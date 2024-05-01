const core = require('@actions/core');
const YAML = require('yaml');
const helm = require('./helm');
const config = require('./config');
const exec = require('@actions/exec');


const HELM_STATUS = {
    INSTALL: 0,
    UPGRADE: 1,
    IGNORE: 2,
    FAIL: 3
};

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

async function install(config) {
    let args = [];
    args.push('upgrade');
    args.push('--install');
    args.push(config.input.release);

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
    return args;
}

async function uninstall(config) {
    let args = [];
    args.push('uninstall');
    args.push(config.input.release);
    if (config.input.timeout) args.push('--timeout=' + config.input.timeout);
    return args;
}

async function status(config) {
    let hc = new helm.Helm(process.env['HELM_VERSION'], process.env['RUNNER_TEMP']);
    const release_status = await hc.execute([
        'status', config.input.release,
        '--namespace=' + config.input.namespace,
        '--output', 'json', '--kubeconfig=' + config.kubeconfig], true);
    if (release_status) {
        switch (config.input.action) {
        case 'uninstall':
            if (release_status.info.status.startsWith('pending')) {
                core.info('Helm chart ' + config.input.namespace + '/' + config.input.release + ': pending. Cancelling');
                return HELM_STATUS.IGNORE;
            }
            break;
        case 'status':
            setOutput(release_status);
            return HELM_STATUS.IGNORE;
        default:
            switch(release_status.info.status) {
            case 'deployed':
                return HELM_STATUS.UPGRADE;
            case 'pending-install':
            case 'pending-upgrade':
            case 'pending-rollback':
                core.info('Helm chart ' + config.input.namespace + '/' + config.input.release + ': pending. Cancelling');
                return HELM_STATUS.IGNORE;
            default:
                core.info('[command]kubectl --namespace ' + config.input.namespace + ' delete secret sh.helm.release.v1.' + config.input.release + '.v' + release_status.version);
                await exec.exec('kubectl', ['-n', config.input.namespace, 'delete', 'secret', 'sh.helm.release.v1.' + config.input.release + '.v' + release_status.version], {
                    ignoreReturnCode: true,
                    silent: true
                });
            }
        }
    } else {
        switch (config.input.action) {
        case 'uninstall':
            core.info('Helm chart ' + config.input.namespace + '/' + config.input.release + ': not found. Nothing to do');
            return HELM_STATUS.IGNORE;
        case 'status':
            core.setOutput('status', 'uninstalled');
            return HELM_STATUS.IGNORE;
        default:
            core.debug('Helm chart ' + config.input.namespace + '/' + config.input.release + ': not found');
        }
    }
    return HELM_STATUS.INSTALL;
}

function setOutput(output) {
    core.setOutput('status', output.info.status);
    core.setOutput('revision', output.version);
    core.setOutput('first-deployed', output.info.first_deployed);
    core.setOutput('last-deployed', output.info.last_deployed);
}

async function main() {
    try {
        let args = [];
        switch(config.input.action) {
        case 'install':
            args = await install(config);
            break;
        case 'uninstall':
            args = await uninstall(config);
            break;
        case 'status':
            break;
        default:
            throw new Error('Only status, install and uninstall are supported');
        }
        args.push('--namespace=' + config.input.namespace);
        args.push('--kubeconfig=' + config.kubeconfig);
        if (config.input.dry_run) args.push('--dry-run');
        if (config.input.extra_vars) args.push(config.input.extra_vars);
        if (config.input.helm_opts) args.push(config.input.helm_opts);

        let hc = new helm.Helm(process.env['HELM_VERSION'], process.env['RUNNER_TEMP']);
        
        if (config.input.repo_url.startsWith('oci:')) {
            await hc.ecrLogin(
                config.input.repo_url,
                config.input.repo_username,
                config.input.repo_password);
        }

        switch(await status(config)) {
        case HELM_STATUS.FAIL:
            process.exit(1);
        /* eslint-disable no-fallthrough */
        case HELM_STATUS.IGNORE:
            process.exit(0);
        /* eslint-disable no-fallthrough */
        case HELM_STATUS.UPGRADE:
            if (config.input.rollback_on_failure) args.push('--atomic');
        }

        let output = await hc.execute(args);
        switch (config.input.action) {
        case 'install': {
            try {
                core.notice('Helm chart ' + config.input.namespace + '/' + config.input.release + ': ' + output.info.description);
                setOutput(output);
            } catch (error) {
                core.warning('Helm chart ' + config.input.namespace + '/' + config.input.release + ': Installation successful but unable to retrieve output. Error message: ' + error.message);
            }
            break;
        }
        case 'uninstall':
            core.notice('Helm chart ' + config.input.namespace + '/' + config.input.release + ': Uninstall complete');
            break;
        default:
            core.info(output);
        }
        process.exit(0);
    } catch (error) {
        core.setFailed(error.message);
        process.exit(1);
    }
}

main();