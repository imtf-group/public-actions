const core = require('@actions/core');

async function cleanup() {
    try {
        const domains = core.getState('domains');
        domains.split('\n').forEach(line => {
            core.exportVariable(line.split(':', 2)[1].trim(), '');
        });
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

cleanup();
