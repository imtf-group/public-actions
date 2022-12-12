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

        if (labels.length > 0) {
            await client.rest.issues.addLabels({
                labels: labels,
                owner: context.issue.owner,
                repo: context.issue.repo,
                issue_number: issueNumber
            });
        }
        const label_api = await client.rest.issues.listLabelsOnIssue({
            owner: context.issue.owner,
            repo: context.issue.repo,
            issue_number: issueNumber
        });
        core.info(label_api);
        let labelList = []
        label_api.forEach(label => labelList.push(label.name));
        core.setOutput("labels", labelList.join(","));
    } catch (error) {
        core.setFailed(error.message);
    }
};

run();
