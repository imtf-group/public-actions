const core = require('@actions/core');

const {
    Codeartifact
} = require('@aws-sdk/client-codeartifact');

const {
    STS
} = require('@aws-sdk/client-sts');


function getCredentials() {
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
        const sts = new STS(credentials);
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
        const domains = core.getInput('domains', {required: true});
        const domainOwner = core.getInput('domain-owner', {required: true});
        let domainArray = [];
        let domainTokens = [];
        domains.split('\n').forEach(line => {
            domainArray.push({domain: line.split(':')[0], variable: line.split(':', 2)[1].trim()});
            if (!domainTokens.includes(line.split(':')[0])) domainTokens.push(line.split(':')[0]);
        });
        let accessparams = getCredentials();
        if (role) {
            accessparams = await getCrossAccountCredentials(accessparams, role);
        }
        const ca = new Codeartifact(accessparams);
        core.saveState('domains', domainArray);
        domainTokens.forEach(async domainToken => {
            let request = {
                domain: domainToken,
                domainOwner: domainOwner
            };
            core.debug('Request: ' + JSON.stringify(request));
            await ca.getAuthorizationToken(request, (err, response) => {
                if (err) {
                    core.setFailed(err);
                    return 1;
                } else {
                    core.debug('Response: ' + JSON.stringify(response));
                    domainArray.forEach(domain => {
                        if (domainToken == domain.domain) {
                            core.exportVariable(domain.variable, response.authorizationToken);
                        }
                    });
                }
            });
        });
    } catch (error) {
        core.setFailed(error.message);
        return 1;
    }
}

main();
