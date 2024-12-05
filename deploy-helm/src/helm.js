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
    constructor(version) {
        this.version = version;
        this.path = '';
    }

    async getHelmLatestVersion() {
        const downloadPath = await tc.downloadTool('https://github.com/helm/helm/releases');
        const lines = fs.readFileSync(downloadPath, 'ascii').split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            let regex = /\/helm\/helm\/releases\/tag\/v3.[0-9]*.[0-9]*"/;
            if (regex.test(lines[i])) {
                let regex2 = /.*\/helm\/helm\/releases\/tag\/v([0-9.]+)".*/g;
                return regex2.exec(lines[i])[1];
            }
        }
        throw new Error('Could not retrieve Helm version. Try to use HELM_VERSION variable.');
    }

    async installHelm(version) {
        if (!version) {
            const allVersions = tc.findAllVersions('helm');
            core.debug(`Installed helm versions: ${JSON.stringify(allVersions)}`);
            version = (allVersions.length > 0) ? allVersions[0] : await this.getHelmLatestVersion();
        }
        let toolPath = tc.find('helm', version);
        if (!toolPath) {
            core.info(`Installing Helm ${version}`);
            let arch = '';
            switch (os.arch()) {
            case 'arm64':
                arch = 'arm64';
                break;
            case 'x64':
                arch = 'amd64';
                break;
            default:
                throw new Error(`Architecture not supported: ${os.arch()}`);
            }
            core.debug(`Detected architecture: ${arch}`);
            const toolDirectoryName = `${os.platform()}-${arch}`;
            const url = `https://get.helm.sh/helm-v${version}-${toolDirectoryName}.tar.gz`;
            const downloadPath = await tc.downloadTool(url);
            const extractedPath = await tc.extractTar(downloadPath);
            const toolRoot = path.join(extractedPath, toolDirectoryName);
            let toolPath = await tc.cacheDir(toolRoot, 'helm', version);
            core.info(`Helm installed at ${toolPath}`);
            core.addPath(toolPath);
        }
        return toolPath;
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
        if ((!repo_username) && (!repo_password)) {
            return;
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
        if (!this.path) {
            const toolPath = await this.installHelm(this.version);
            this.path = path.join(toolPath, 'helm');
        }
        core.info(`[command]${this.path} ${args.join(' ')}`);
        let exitCode = await exec.exec(this.path, args, {
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
