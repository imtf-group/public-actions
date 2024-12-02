const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const tc = require('@actions/tool-cache');

async function getVersion() {
    const mvn_archive = await tc.downloadTool('https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/');
    const lines = fs.readFileSync(mvn_archive, 'ascii').split(/\r?\n/);
    for (let i = lines.length; i > 0; i--) {
        let regex = /<a href="[0-9]+\.[0-9]+\.[0-9]+/;
        if (regex.test(lines[i])) {
            let regex2 = /.*<a href="([0-9]+\.[0-9]+\.[0-9]+)\/".*/g;
            let regex_array = regex2.exec(lines[i]);
            if (regex_array) {
                return regex_array[1];
            }
        }
    }
    throw new Error('Could not retrieve Helm version. Try to use MVN_VERSION variable.');
}

async function downloadMaven(version) {
    const toolDirectoryName = `apache-maven-${version}`;
    const downloadUrl = `https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${version}/apache-maven-${version}-bin.tar.gz`;
    core.debug(`downloading ${downloadUrl}`);
    const downloadPath = await tc.downloadTool(downloadUrl);
    const extractedPath = await tc.extractTar(downloadPath);
    let toolRoot = path.join(extractedPath, toolDirectoryName);
    return await tc.cacheDir(toolRoot, 'maven', version);
}

async function run() {
    try {
        let version = core.getInput('version');
        if (!version) {
            version = process.env['MVN_VERSION'];
        }
        if (!version) {
            version = await getVersion();
        }
        let toolPath = tc.find('maven', version);
        if (!toolPath) {
            toolPath = await downloadMaven(version);
            core.info(`Maven installed at ${toolPath}`);
            toolPath = path.join(toolPath, 'bin');
            core.addPath(toolPath);
        } else {
            core.info(`Found Maven in cache ${toolPath}`);
        }
    } catch (error) {
        core.setFailed(error);
    }
}

run();
