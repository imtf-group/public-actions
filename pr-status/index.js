const github = require('@actions/github');
const core = require('@actions/core');

function getInput(value) {
    if (core.getInput(value).replace('_', '-')) {
        return core.getInput(value.replace('_', '-'));
    } else {
        return core.getInput(value.replace('-', '_'));
    }
}

async function main() {
    try {
        const githubToken = getInput('github-token');
        let prNumber = getInput('pull-request-id');
        if (!githubToken) {
            throw new Error('No github token provided');
        }
        payload = github.context.payload;
        core.debug('payload = ' + JSON.stringify(payload));
        if ((!prNumber) && (!payload.number) && (!payload.pull_request?.number)) {
            throw new Error('This is not a PR or commenting is disabled.');
        }
        if (!prNumber) {
            prNumber = payload.pull_request?.number || payload.number;
        }
        const client = github.getOctokit(githubToken);
        const pullRequest = await client.rest.pulls.get({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            pull_number: prNumber
        });
        for (let key in pullRequest.data) {
            core.setOutput(key, pullRequest.data[key]);
        }
        let labelList = []
        pullRequest.data['labels'].forEach(label => labelList.push(label.name));
        core.setOutput("label-list", labelList.join(","));
    } catch (error) {
        core.setFailed(error.message);
        return 1;
    }
}

main();
