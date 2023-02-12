const { Uri } = require("vscode");
const {
    createFileFromScratch,
    appendToExistingFile,
    fileExists,
} = require("./helpers");
const { JSCONFIG, BASE_LAUNCH_CONFIG } = require("./constants");
const { uniqBy, uniq } = require("lodash");

const addDebugAndRunOptions = async (workspaceUri, projectUri) => {
    const targetUri = Uri.joinPath(workspaceUri, ".vscode", "launch.json");
    const exists = await fileExists(targetUri);

    const baseConfig = BASE_LAUNCH_CONFIG.baseConfig(projectUri);
    if (!exists) {
        return createFileFromScratch(baseConfig, targetUri);
    }

    return appendToExistingFile(
        { configurations: baseConfig.configurations },
        targetUri,
        (target, source) => {
            return uniqBy([...source, ...target], ({ name }) => name);
        }
    );
};

const generateBaseJsConfig = async (workspaceUri, projectUri) => {
    const targetUri = Uri.joinPath(workspaceUri, JSCONFIG.uri);
    const exists = await fileExists(targetUri);

    if (!exists) {
        return createFileFromScratch(JSCONFIG.baseConfig, targetUri);
    }

    return appendToExistingFile(
        JSCONFIG.baseConfig,
        targetUri,
        (target, source) => uniq([...target, ...source])
    );
};

module.exports = {
    addDebugAndRunOptions,
    generateBaseJsConfig,
};
