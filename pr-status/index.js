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
        if ((!prNumber) && (!github.context.payload.number) && (!github.context.payload.pull_request.number)) {
            throw new Error('This is not a PR or commenting is disabled.');
        }
        if (!prNumber) {
            prNumber = github.context.payload.pull_request.number || github.context.payload.number;
        }
        const client = github.getOctokit(githubToken);
        const pullRequest = await client.rest.pulls.get({
            owner: github.context.issue.owner,
            repo: github.context.issue.repo,
            issue_number: prNumber
        });
        for (let key in pullRequest.data[0]) {
            core.setOutput(key, pullRequest.data[0][key]);
        }
    } catch (error) {
        core.setFailed(error.message);
        return 1;
    }
}

main();
