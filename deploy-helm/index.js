const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('@actions/core');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const YAML = require('yaml');

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
    const temp_directory = process.env['RUNNER_TEMP'];
    const helm_bin = path.join(temp_directory, 'helm');
    const action = core.getInput('action') || 'install';
    const namespace = core.getInput('namespace');
    const repo_url = core.getInput('repository');
    const repo_username = core.getInput('repository-username');
    const repo_password = core.getInput('repository-password');
    const chart_name = core.getInput('chart', {required: true});
    const chart_path = core.getInput('chart-path');
    const values = core.getInput('values');
    const version = core.getInput('version');
    const extra_vars = core.getInput('extra-vars');
    const value_file = core.getInput('value-file');
    const timeout = core.getInput('timeout');
    if ((os.platform() != 'linux') && (os.platform() != 'darwin')) {
        core.setFailed('The runner operating system is not supported');
        return 1;
    }
    const kubeconfig = process.env['KUBECONFIG'] || path.join(process.env['HOME'], '.kube', 'config');
    const helm_opts = process.env['HELM_OPTS'] || '';
    let args = [];
    try {
        switch(action) {
        case 'install':
            args.push('upgrade');
            args.push('--install');
            args.push(chart_name);
            args.push(chart_name);
            if ((!repo_url) && (!chart_path)) {
                throw new Error('either chart-path or repository inputs must be set when installing');
            }
            if ((repo_url) && (chart_path)) {
                throw new Error('chart-path and repository inputs are mutually exclusive when installing');
            }
            if (repo_url) {
                args.push('--repo=' + repo_url);
                if (repo_username) args.push('--username=' + repo_username);
                if (repo_password) args.push('--password=' + repo_password);
            } else {
                args.push(chart_path);
            }
            if (namespace) {
                args.push('--create-namespace');
            }
            if (value_file) {
                if (!fs.existsSync(value_file)) {
                    core.warning('Value file ' + value_file + 'not found. Ignored.');
                } else {
                    args.push('--values=' + value_file);
                }
            }
            if (values) {
                const yaml = YAML.parse(values);
                if (typeof yaml !== 'object') {
                    throw new Error('values input must be in YAML format');
                }
                Object.keys(yaml).forEach(k => {
                    formatValue(k, yaml[k]).forEach(v => {
                        args.push('--set');
                        args.push(v);
                    });
                });
            }
            if (core.getBooleanInput('wait')) args.push('--wait');
            if (version) args.push('--version=' + version);
            if (timeout) args.push('--timeout=' + timeout);
            args.push('--output');
            args.push('json');
            break;
        case 'pull':
            args.push('pull');
            args.push(chart_name);
            if (!repo_url) {
                throw new Error('repository input must be set when pulling');
            }
            args.push('--repo=' + repo_url);
            if (repo_username) args.push('--username=' + repo_username);
            if (repo_password) args.push('--password=' + repo_password);
            if (version) args.push('--version=' + version);
            args.push('--untar');
            if (chart_path) args.push('--untardir=' + chart_path);
            break;
        case 'uninstall':
            args.push('uninstall');
            args.push(chart_name);
            if (timeout) args.push('--timeout=' + timeout);
            break;
        default:
            throw new Error('Only install uninstall and pull are supported');
        }
        if (namespace) args.push('--namespace=' + namespace);
        if (core.getBooleanInput('dry-run')) args.push('--dry-run');
        if (extra_vars) args.push(extra_vars);
        if (helm_opts) args.push(helm_opts);
        if (!fs.existsSync(kubeconfig)) {
            throw new Error('KUBECONFIG file not found: ' + kubeconfig +'. Please set it properly!');
        }
        if (!fs.existsSync(helm_bin)) {
            const helm_version = process.env['HELM_VERSION'] || '3.6.3';
            core.info('Installing Helm ' + helm_version);
            let helm_arch = '';
            switch (os.arch()) {
            case 'arm64':
                helm_arch = 'arm64';
                break;
            case 'x64':
                helm_arch = 'amd64';
                break;
            default:
                throw new Error('Architecture not supported: ' + os.arch());
            }
            core.debug('Detected architecture: ' + helm_arch);
            const url = 'https://get.helm.sh/helm-v' + helm_version + '-' + os.platform() + '-' + helm_arch + '.tar.gz';
            const helm_archive = await tc.downloadTool(url);
            const helm_dir = await tc.extractTar(helm_archive);
            fs.renameSync(
                path.join(helm_dir, os.platform() + '-' + helm_arch, 'helm'),
                helm_bin);
        }
        core.debug('Binary available at: ' + helm_bin);
    } catch (error) {
        core.setFailed(error.message);
        return 1;
    }

    try {
        let output = '';
        let error = '';
        if (action != 'pull') {
            let status_args = ['status', chart_name, '--output', 'json'];
            if (namespace) status_args.push('--namespace=' + namespace);
            core.debug(helm_bin + ' ' + status_args.join(' '));
            await exec.exec(helm_bin, status_args, {
                ignoreReturnCode: true,
                silent: true,
                listeners: {
                    stdout: (data) => {
                        output += data.toString();
                    }
                }
            });

            if ((action == 'uninstall') && (!output)) {
                core.info('Chart ' + chart_name + ' not found. Nothing to do');
                return 0;
            }
            if (action == 'install') {
                if (output) {
                    const chart_status = JSON.parse(output);
                    core.debug('Chart ' + chart_name + ' is ' + chart_status.info.status + ' at version ' + chart_status.version);
                    if (chart_status.info.status != 'deployed') {
                        core.info('[command]kubectl --namespace ' + namespace + ' delete secret sh.helm.release.v1.' + chart_name + '.v' + chart_status.version);
                        await exec.exec('kubectl', ['-n', namespace, 'delete', 'secret', 'sh.helm.release.v1.' + chart_name + '.v' + chart_status.version], {
                            ignoreReturnCode: true,
                            silent: true
                        });
                    } else {
                        args.push('--atomic');
                    }
                } else {
                    core.debug('Chart ' + chart_name + ' not found');
                }
            }
        }
        output = '';
        error = '';
        core.info('[command]' + helm_bin + ' ' + args.join(' '));
        const exitCode = await exec.exec(helm_bin, args, {
            silent: true,
            ignoreReturnCode: true,
            listeners: {
                stdout: (data) => {
                    output += data.toString();
                },
                stderr: (data) => {
                    error += data.toString();
                }
            }
        });
        if (exitCode != 0) {
            throw new Error(error);
        }
        core.debug(output);
        switch (action) {
        case 'install': {
            const install_status = JSON.parse(output);
            core.notice('Helm chart ' + install_status.namespace + '/' + chart_name + ': ' + install_status.info.description);
            core.setOutput('status', install_status.info.status);
            core.setOutput('revision', install_status.version);
            core.setOutput('first-deployed', install_status.info.first_deployed);
            core.setOutput('last-deployed', install_status.info.last_deployed);
            break;
        }
        case 'uninstall':
            core.notice('Helm chart ' + (namespace || 'default') + '/' + chart_name + ': Uninstall complete');
            break;
        case 'pull':
            core.notice('Helm chart ' + (namespace || 'default') + '/' + chart_name + ': Pull complete at ' + ((chart_path) ? chart_path : process.cwd()));
            break;
        default:
            core.info(output);
        }
    } catch (error) {
        core.setFailed(error.message);
        return 1;
    }
}

main();
