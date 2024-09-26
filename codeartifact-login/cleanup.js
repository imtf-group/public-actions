const core = require('@actions/core');

async function cleanup() {
    try {
        const domains = core.getState('domains');
        domains.forEach(domain => {
            core.exportVariable(domain.variable, '');
        });
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

cleanup();
