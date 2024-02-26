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

async function getWorkflows(githubToken, ignoreErrors) {
    const payload = github.context.payload;
    const client = github.getOctokit(githubToken);
    let workflows = {};
    try {
        workflows = await client.rest.actions.listWorkflowRunsForRepo({
            owner: payload.repository.owner.login,
            repo: payload.repository.name
        });
    } catch (error) {
        core.setFailed(error.message);
        if (ignoreErrors) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    }
    return workflows.data['workflow_runs'];
}

function indexOfWorkflows(workflows, run_id) {
    for (let number in workflows) {
        let workflow = workflows[number];
        if (workflow['id'] == run_id) {
            return workflow;
        }
    }
    return {};
}

async function main() {
    const githubToken = getInput('github-token');
    const pollInterval = parseInt(getInput('poll-interval')) || 5;
    const continueAfterSeconds = parseInt(getInput('continue-after-seconds')) || 300;
    const sameBranchOnly = getBooleanInput('same-branch-only');
    const ignoreErrors = getBooleanInput('ignore-errors');
    const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF?.substring(11) || 'main';
    const currentId = parseInt(process.env.GITHUB_RUN_ID);
    if (!githubToken) {
        core.setFailed('No github token provided');
        process.exit(1);
    }
    core.debug('current repository: ' + process.env.GITHUB_REPOSITORY);
    core.debug('current branch: ' + branch);
    core.debug('current run ID: ' + currentId);
    let run_ids = [];
    let workflow_names = {};
    const workflows = await getWorkflows(githubToken, ignoreErrors);
    for (let number in workflows) {
        let workflow = workflows[number];
        if ((workflow['head_branch'] != branch) && (sameBranchOnly)) {
            continue;
        }
        if (workflow['status'] !== 'completed') {
            core.debug('Found a running job: ' + workflow['display_title'] + ' (' + workflow['id'] + ')');
            run_ids.push(workflow['id']);
            workflow_names[workflow['id']] = workflow['display_title'];
        }
    }
    run_ids.sort((a, b) => a - b);

    let elapsedSeconds = 0;
    while (run_ids.length > 1) {
        if (run_ids[0] == currentId) {
            break;
        }
        let seat = run_ids.indexOf(currentId);
        let info_message = 'Please hold the line, you are number ' + seat + ' in the waiting list';
        let current_workflow_names = [];
        for (let pos in run_ids) {
            if (run_ids[pos] !== currentId) {
                current_workflow_names.push(workflow_names[run_ids[pos]]);
            }
        }
        info_message += ' (' + current_workflow_names.join(',') + ')';
        core.info(info_message);
        await delay(pollInterval);
        elapsedSeconds += pollInterval;
        if (elapsedSeconds > continueAfterSeconds) {
            core.info('Exceeded wait seconds. Continuing...');
            process.exit(0);
        }
        let new_ids = [];
        let currentWorkflows = await getWorkflows(githubToken, ignoreErrors);
        for (let number in run_ids) {
            let run_id = run_ids[number];
            if (run_id == currentId) {
                new_ids.push(currentId);
            } else {
                details = indexOfWorkflows(currentWorkflows, run_id);
                if (details) {
                    core.debug('Workflow "' + details['display_title'] + '" (' + run_id + ') is in ' + details['status'] + ' state');
                    if ((details['status'] !== 'completed') && (details['status'] !== 'cancelled') && (details['status'] !== 'failure')) {
                        new_ids.push(run_id);
                    }
                }
            }
        }
        new_ids.sort((a, b) => a - b);
        run_ids = Array.from(new_ids);
    }
    core.info('This is your turn ! Yoohoo !');
}

main();
