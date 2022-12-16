const core = require('@actions/core');
const AWS = require('aws-sdk');

async function getCrossAccountCredentials(role) {
    return new Promise((resolve, reject) => {
        const sts = new AWS.STS({apiVersion: '2011-06-15'});
        const params = {
            RoleArn: role,
            RoleSessionName: 'GitHubActions'
        };
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
        let resourceRecords = [];
        const role = core.getInput('role-to-assume');
        const action = core.getInput('action');
        const hosted_zone_id = core.getInput('hosted-zone-id', {required: true});
        const name = core.getInput('name', {required: true});
        const type = core.getInput('type');
        const ttl = core.getInput('ttl');
        core.getInput('values', {required: true})
            .split(/\r?\n/)
            .forEach(v => resourceRecords.push({Value: v}));
        var accessparams = {};
        if (role) {
            accessparams = await getCrossAccountCredentials(role);
        }
        const client = new AWS.Route53(accessparams);
        const request = {
            HostedZoneId: hosted_zone_id,
            ChangeBatch: {
                Changes: [{
                    Action: (action ? action : 'UPSERT'),
                    ResourceRecordSet: {
                        Name: name,
                        Type: (type ? type : 'CNAME'),
                        TTL: (ttl ? ttl : '300'),
                        ResourceRecords: resourceRecords
                    }
                }]
            }
        };
        core.debug('Request: ' + JSON.stringify(request));
        await client.changeResourceRecordSets(
            request,
            (err, data) => {
                if (err) {
                    if (err.message.includes('not found')) {
                        core.info('DNS ' + name + ' does not exist');
                        return 0;
                    } else {
                        core.setFailed(err);
                        return 1;
                    }
                } else {
                    core.debug('Response: ' + JSON.stringify(data));
                    if (action == 'DELETE') {
                        core.notice('DNS ' + name + ' deleted');
                    } else {
                        core.notice('DNS ' + name + ' redirects to ' + core.getInput('values'));
                    }
                }
            });
    } catch (error) {
        core.setFailed(error.message);
        return 1;
    }
}

main();
