const core = require('@actions/core');
const AWS = require('aws-sdk');
const YAML = require('yaml');


async function getCredentials() {
    let credentials = {};
    const accessKeyId = core.getInput('aws-access-key-id');
    const secretAccessKey = core.getInput('aws-secret-access-key');
    const region = core.getInput('aws-region');
    if (accessKeyId) credentials['accessKeyId'] = accessKeyId;
    if (secretAccessKey) credentials['secretAccessKey'] = secretAccessKey;
    if (region) credentials['region'] = region;
    return credentials;
}

async function getCrossAccountCredentials(credentials, role) {
    return new Promise((resolve, reject) => {
        const sts = new AWS.STS(credentials);
        const params = {
            RoleArn: role,
            RoleSessionName: 'GitHubActions'
        };
        core.debug('Request: ' + JSON.stringify(params));
        sts.assumeRole(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve({
                    accessKeyId: data.Credentials.AccessKeyId,
                    secretAccessKey: data.Credentials.SecretAccessKey,
                    sessionToken: data.Credentials.SessionToken,
                });
            }
        });
    });
}

async function main() {
    try {
        const role = core.getInput('role-to-assume');
        const domains = YAML.parse(core.getInput('domains', {required: true}));
        const domainOwner = core.getInput('domain-owner', {required: true});
        if (typeof domains !== 'object') {
            throw new Error('domains input must be in YAML format');
        }
        let accessparams = getCredentials();
        if (role) {
            accessparams = await getCrossAccountCredentials(accessparams, role);
        }
        const ca = new AWS.CodeArtifact(accessparams);
        core.saveState('domains', domains);
        Object.keys(domains).forEach(async domain => {
            let request = {
                domain: domain,
                domainOwner: domainOwner
            };
            core.debug('Request: ' + JSON.stringify(request));
            await ca.getAuthorizationToken(request, (err, response) => {
                if (err) {
                    core.setFailed(err);
                    return 1;
                } else {
                    core.debug('Response: ' + JSON.stringify(response));
                    core.exportVariable(domains[domain], response.authorizationToken);
                }
            });
        });
    } catch (error) {
        core.setFailed(error.message);
        return 1;
    }
}

main();
