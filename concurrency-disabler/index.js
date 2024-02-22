const github = require('@actions/github');
const core = require('@actions/core');

function getInput(value) {
    if (core.getInput(value).replace('_', '-')) {
        return core.getInput(value.replace('_', '-'));
    } else {
        return core.getInput(value.replace('-', '_'));
    }
}

function getBooleanInput(value) {
    return ['TRUE', '1'].includes(getInput(value).toUpperCase());
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time * 1000));
}

async function main() {
    const githubToken = getInput('github-token');
    const pollInterval = parseInt(getInput('poll-interval')) || 5;
    const sameBranchOnly = getBooleanInput('same-branch-only');
    const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF?.substring(11) || 'main';
    const currentId = parseInt(process.env.GITHUB_RUN_ID);
    if (!githubToken) {
        core.setFailed('No github token provided');
        process.exit(1);
    }
    const payload = github.context.payload;
    const client = github.getOctokit(githubToken);
    core.debug('current repository: ' + process.env.GITHUB_REPOSITORY);
    core.debug('current branch: ' + branch);
    core.debug('current run ID: ' + currentId);
    const { data: workflows } = await client.rest.actions.listWorkflowRunsForRepo({
        owner: payload.repository.owner.login,
        repo: payload.repository.name
    });
    let run_ids = [];
    for (let number in workflows['workflow_runs']) {
        let workflow = workflows['workflow_runs'][number];
        if ((workflow['head_branch'] != branch) && (sameBranchOnly)) {
            continue;
        }
        if (workflow['status'] !== 'completed') {
            core.debug('Found a running job: ' + workflow['id']);
            run_ids.push(workflow['id']);
        }
    }
    run_ids.sort((a, b) => a - b);

    while (run_ids.length > 1) {
        if (run_ids[0] == currentId) {
            break;
        }
        let seat = run_ids.indexOf(currentId);
        core.info('Please hold the line, you are number ' + seat + ' in the waiting list');
        await delay(pollInterval);
        let new_ids = [];
        for (let number in run_ids) {
            let run_id = run_ids[number];
            if (run_id == currentId) {
                new_ids.push(currentId);
            } else {
                let { data: details } = await client.rest.actions.getWorkflowRun({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    run_id: run_id
                });
                core.debug('Run ' + run_id + ' is in ' + details['status'] + ' state');
                if ((details['status'] !== 'completed') && (details['status'] !== 'cancelled') && (details['status'] !== 'failure')) {
                    new_ids.push(run_id);
                }
            }
        }
        new_ids.sort((a, b) => a - b);
        run_ids = Array.from(new_ids);
    }
    core.info('This is your turn ! Yoohoo !');
}

main();
