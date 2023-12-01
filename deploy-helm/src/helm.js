const path = require('path');
const fs = require('fs');
const os = require('os');
const exec = require('@actions/exec');
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const {
    ECR
} = require('@aws-sdk/client-ecr');



class Helm {
    constructor(version, installDir) {
        this.version = version;
        this.installDir = installDir;
    }

    async getVersion() {
        if (this.version) {
            return this.version;
        }
        const helm_archive = await tc.downloadTool('https://github.com/helm/helm/releases');
        const lines = fs.readFileSync(helm_archive, 'ascii').split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            let regex = /\/helm\/helm\/releases\/tag\/v3.[0-9]*.[0-9]*"/;
            if (regex.test(lines[i])) {
                let regex2 = /.*\/helm\/helm\/releases\/tag\/v([0-9.]+)".*/g;
                this.version = regex2.exec(lines[i])[1];
                return this.version;
            }
        }
        throw new Error('Could not retrieve Helm version. Try to use HELM_VERSION variable.');
    }

    async path() {
        if (!this.installDir) {
            throw new Error('Helm install directory must be set. Try to use the RUNNER_TEMP variable.');
        }
        const helm_bin = path.join(this.installDir, 'helm');
        if (!fs.existsSync(helm_bin)) {
            const helm_version = await this.getVersion();
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
            core.debug('Binary available at: ' + helm_bin);
        }
        return helm_bin;
    }

    async getEcrAuthToken(registry) {
        const ecr = new ECR({
            region: registry.split('.')[3]
        });
        const authTokenResponse = await ecr.getAuthorizationToken({registryIds: [registry.split('.')[0]]});
        if (!authTokenResponse) {
            throw new Error('Amazon ECR authorization token returned no data');
        } else if (!authTokenResponse.authorizationData || !Array.isArray(authTokenResponse.authorizationData)) {
            throw new Error('Amazon ECR authorization token is invalid');
        } else if (!authTokenResponse.authorizationData.length) {
            throw new Error('Amazon ECR authorization token does not contain any authorization data');
        }
        const authToken = Buffer.from(authTokenResponse.authorizationData[0].authorizationToken, 'base64').toString('utf-8');
        return authToken.split(':', 2);
    }

    async ecrLogin(registry, username, password) {
        let output = await this.execute(['chart'], true);
        if (output) {
            throw new Error('This Helm installation doesn\'t support OCI registries.');
        }
        let repo_username = username;
        let repo_password = password;
        if ((registry.endsWith('amazonaws.com')) && (!repo_username) && (!repo_password)) {
            const EcrCredentials = await this.getEcrAuthToken(registry);
            repo_username = EcrCredentials[0];
            repo_password = EcrCredentials[1];
            core.setSecret(repo_password);
        }
        const registry_args = [
            'registry',
            'login',
            '--username',
            repo_username,
            '--password',
            repo_password,
            registry
        ];
        await this.execute(registry_args);
    }

    async execute(args, ignoreReturnCode = false) {
        let output = '';
        let error = '';
        const helm_binary = await this.path();
        core.info('[command]' + helm_binary + ' ' + args.join(' '));
        let exitCode = await exec.exec(helm_binary, args, {
            silent: true,
            ignoreReturnCode: true,
            listeners: {
                stderr: (data) => {
                    error += data.toString();
                },
                stdout: (data) => {
                    output += data.toString();
                }
            }
        });
        if ((!ignoreReturnCode) && (exitCode != 0)) {
            throw new Error(error.trim());
        }
        output = output.trim();
        if (output) {
            core.debug(output);
            try {
                return JSON.parse(output);
            } catch {
                return output;
            }
        }
    }
}

module.exports.Helm = Helm;
