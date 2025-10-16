const github = require('@actions/github');
const core = require('@actions/core');

function getBooleanInput(value) {
    return ['TRUE', '1'].includes(getInput(value).toUpperCase());
}

function getInput(value) {
    if (core.getInput(value).replace('_', '-')) {
        return core.getInput(value.replace('_', '-'));
    } else {
        return core.getInput(value.replace('-', '_'));
    }
}

function checkValidity(message, allowedTypes) {
    if (message.startsWith('Merge ') || message.startsWith('Revert ')) {
        return true;
    }
    if (message.split(':').length < 2) {
        return false;
    }
    const commitType = message.split(':')[0].replace(/\(\S*?\)/, '').replace(/!/g, '');
    return allowedTypes.includes(commitType);

}

async function main() {
    try {
        const githubToken = getInput('github-token');
        const fullCheck = getBooleanInput('full-check');
        const inputAllowedTypes = getInput('allowed-commit-types');
        const checkTitle = getBooleanInput('check-title');
        let allowedTypes = [];
        if (inputAllowedTypes) {
            allowedTypes = inputAllowedTypes.split(',');
        } else {
            allowedTypes = [
                'fix',
                'feat',
                'build',
                'chore',
                'ci',
                'docs',
                'style',
                'refactor',
                'revert',
                'perf',
                'test'
            ];
        }
        if (!githubToken) {
            throw new Error('No github token provided');
        }
        const payload = github.context.payload;
        const client = github.getOctokit(githubToken);
        let messages = [];
        if (payload.pull_request) {
            if(checkTitle) {
                messages.push(payload.pull_request.title);
            }
            if (fullCheck) {
                const pullRequest = await client.rest.pulls.listCommits({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    pull_number: payload.pull_request.number
                });
                pullRequest.data.forEach((key) => {
                    messages.push(key.commit.message);
                });
            }
        } else {
            payload.commits.forEach((commit) => {
                messages.push(commit.message);
            });
        }
        core.debug('allowedTypes: ' + JSON.stringify(allowedTypes));
        core.debug('commit messages: ' + JSON.stringify(messages));
        let error = false;
        messages.forEach((message) => {
            if (checkValidity(message, allowedTypes)) {
                core.info(`🟢 ${message}`);
            } else {
                core.info(`⛔ ${message}`);
                error = true;
            }
        });
        if (!error) {
            core.info('✨ All the commit messages follow the Conventional Commits specification.');
        } else {
            core.setFailed(
                '🚨 At least one of the commit messages is invalid regarding the Conventional Commits specification. \n' +
                'Please check: https://www.conventionalcommits.org/en/v1.0.0/ \n' +
                'Examples: \n' +
                'feat(lang): add Polish language\n' +
                'chore!: drop support for Node 6\n' +
                'fix: TOP-001 prevent racing of requests\n'
            );
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

main();
