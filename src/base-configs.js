const { workspace } = require("vscode");
const { createFileFromScratch, appendToExistingFile } = require("./helpers");
const { JSCONFIG, BASE_LAUNCH_CONFIG } = require("./constants");
const { uniqBy, uniq } = require("lodash");

const addDebugAndRunOptions = async () => {
    const filesResults = await workspace.findFiles(".vscode/launch.json");
    const fileUri = filesResults[0];

    if (!fileUri) {
        return createFileFromScratch(
            BASE_LAUNCH_CONFIG(),
            ".vscode/launch.json"
        );
    }

    return appendToExistingFile(
        { configurations: BASE_LAUNCH_CONFIG().configurations },
        fileUri,
        (target, source) => {
            return uniqBy([...source, ...target], ({ name }) => name);
        }
    );
};

const generateBaseJsConfig = async () => {
    const fileResults = await workspace.findFiles(JSCONFIG.uri);
    const fileUri = fileResults[0];

    if (!fileUri) {
        return createFileFromScratch(JSCONFIG.baseConfig, JSCONFIG.uri);
    }

    return appendToExistingFile(
        JSCONFIG.baseConfig,
        fileUri,
        (target, source) => uniq([...target, ...source])
    );
};

module.exports = {
    addDebugAndRunOptions,
    generateBaseJsConfig,
};
