const core = require('@actions/core');

async function cleanup() {
    try {
        const domains = core.getState('domains');
        Object.keys(domains).forEach(domain => {
            core.exportVariable(domains[domain], '');
        });
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

cleanup();
