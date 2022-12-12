const { context, getOctokit } = require('@actions/github');
const core = require('@actions/core');

const run = async() => {
    try {
        const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN;

        const labels = core.getInput('labels').split('\n').filter(l => l !== '');

        let issueNumber = core.getInput('issue_number');
        if (!issueNumber) {
            issueNumber = context.issue.number;
        } else {
            issueNumber = parseInt(issueNumber); 
        }

        if (labels.length === 0) {
            return;
        }
        if (!githubToken) {
            throw new Error('No github token provided');
        }

        if ((!issueNumber) && (!context.issue.number)) {
            throw new Error('This is not a PR or commenting is disabled.');
        }

        const client = getOctokit(githubToken);
        if (!client) {
            throw new Error('Client couldn\'t be created, make sure that token is correct.');
        }

        await client.rest.issues.addLabels({
            labels: labels,
            owner: context.issue.owner,
            repo: context.issue.repo,
            issue_number: issueNumber
        });
    } catch (error) {
        core.setFailed(error.message);
    }
};

run();
