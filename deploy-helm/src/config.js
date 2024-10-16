const uuid = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');
const YAML = require('yaml');
const core = require('@actions/core');


class Config {
    getBooleanInput(value) {
        return ['TRUE', '1'].includes(this.getInput(value).toUpperCase());
    }

    getInput(value) {
        if (core.getInput(value.replaceAll('_', '-'))) {
            return core.getInput(value.replaceAll('_', '-'));
        } else {
            return core.getInput(value.replaceAll('-', '_'));
        }
    }
    constructor() {
        this.input = {
            namespace: this.getInput('namespace') || 'default',
            repo_url: this.getInput('repository'),
            repo_username: this.getInput('repository-username'),
            repo_password: this.getInput('repository-password'),
            chart_name: this.getInput('chart') ? this.getInput('chart') : this.getInput('release'),
            release: this.getInput('release'),
            chart_path: this.getInput('chart-path'),
            values: this.getInput('values'),
            version: this.getInput('version'),
            action: this.getInput('action'),
            extra_vars: this.getInput('extra-vars'),
            timeout: this.getInput('timeout'),
            wait: this.getBooleanInput('wait'),
            dry_run: this.getBooleanInput('dry-run'),
            rollback_on_failure: this.getBooleanInput('rollback-on-failure'),
            use_devel: this.getBooleanInput('use-development-version'),
            helm_opts: process.env['HELM_OPTS'] || ''
        };
        const inline_value_file = this.getInput('inline-value-file');
        const value_file = this.getInput('value-file');
        this.kubeconfig = process.env['KUBECONFIG'] || path.join(os.userInfo().homedir, '.kube', 'config');
        if (!process.env['RUNNER_TEMP']) {
            throw new Error('environment variable RUNNER_TEMP must be set');
        }
        if ((os.platform() != 'linux') && (os.platform() != 'darwin')) {
            throw new Error('The runner operating system is not supported');
        }
        if ((value_file) && (inline_value_file)) {
            throw new Error('value-file and inline-value-file are mutually exclusive');
        }
        if (value_file) {
            this.input.value_file = value_file;
        } else if (inline_value_file) {
            const value_file_path = path.join(process.env['RUNNER_TEMP'], uuid.v1() + '.yaml');
            fs.writeFileSync(value_file_path, inline_value_file);
            core.debug(fs.readFileSync(value_file_path, { encoding: 'utf8', flag: 'r' }));
            this.input.value_file = value_file_path;
        }
        if ((this.input.repo_password) && (!this.input.repo_username)) {
            throw new Error('repository-password set but repository-username not set.');
        }
        if ((!this.input.repo_password) && (this.input.repo_username)) {
            throw new Error('repository-username set but repository-password not set.');
        }
        if (this.input.action == 'install') {
            if ((!this.input.repo_url) && (!this.input.chart_path)) {
                throw new Error('either chart-path or repository inputs must be set when installing');
            } else if ((this.input.repo_url) && (this.input.chart_path)) {
                throw new Error('chart-path and repository inputs are mutually exclusive when installing');
            }
            if (this.input.values) {
                const yaml = YAML.parse(this.input.values);
                if (typeof yaml !== 'object') {
                    throw new Error('values input must be in YAML format');
                }
            }
        }
        if (!['install', 'status', 'uninstall'].includes(this.input.action)) {
            throw new Error('Only status, install and uninstall are supported');
        }
        if (!fs.existsSync(this.kubeconfig)) {
            throw new Error('KUBECONFIG file not found: ' + this.kubeconfig + '. Please set it properly!');
        }
        core.debug('kubeconfig file location: ' + this.kubeconfig);
    }
}

try {
    module.exports = new Config();
} catch (error) {
    core.setFailed(error.message);
    process.exit(1);
}
