const { Uri, workspace, window, commands, FileType } = require("vscode");
const { TextDecoder, TextEncoder } = require("util");
const { isEqual } = require("lodash");
const json5 = require("json5");
const merge = require("deepmerge");

const writeToFile = async (data, targetUri) => {
    const path = targetUri.fsPath;
    try {
        await workspace.fs.writeFile(targetUri, data);
        console.log(`Successfully wrote to file ${path}!`);
    } catch (e) {
        window.showErrorMessage(`Unable to write contents to file: ${path}`);
    }
};

const createFileFromScratch = async (data, targetUri) => {
    if (!(targetUri instanceof Uri)) {
        throw new Error("Expected to receive uri");
    }

    console.log(`${targetUri.fsPath} does not exists, creating one...`);

    const baseConfigAsString = JSON.stringify(data, null, 2);
    const encodedBaseConfig = new TextEncoder().encode(baseConfigAsString);

    return writeToFile(encodedBaseConfig, targetUri);
};

const appendToExistingFile = async (dataObject, targetUri, arrayMergeMode) => {
    console.log(`${targetUri.fsPath} exists, appending needed info.`);

    const existingFileContent = await workspace.fs.readFile(targetUri);
    const existingDecodedConfig = json5.parse(
        new TextDecoder().decode(existingFileContent)
    );

    const newConfig = merge(existingDecodedConfig, dataObject, {
        arrayMerge: arrayMergeMode,
    });

    if (isEqual(existingDecodedConfig, newConfig)) {
        console.log(
            `Generated configs are equal to existing ones for file: ${targetUri.fsPath}. No work to do.`
        );
        return;
    }

    return writeToFile(
        new TextEncoder().encode(JSON.stringify(newConfig, null, 2)),
        targetUri
    );
};

// Workaround to reload only the extension.
const reloadExtension = () =>
    commands.executeCommand("_meteorToolbox.reloadExtension");

const toggleAutoRunPackagesWatcher = async () => {
    const configuration = workspace.getConfiguration();

    const { auto, ...currentValue } = configuration.get(
        "conf.settingsEditor.meteorToolbox"
    );

    const newValue = { ...currentValue, ...{ auto: !!!auto } };

    await configuration.update("conf.settingsEditor.meteorToolbox", newValue);
    await reloadExtension();
};

const clearMeteorBuildCache = async () => {
    const workspaceRoot = workspace.workspaceFolders[0].uri;
    const localMeteorPath = [".meteor", "local"];

    const webBuildPath = Uri.joinPath(
        workspaceRoot,
        ...localMeteorPath,
        "build"
    );
    const cordovaBuildPath = Uri.joinPath(
        workspaceRoot,
        ...localMeteorPath,
        "cordova-build"
    );

    await Promise.all(
        [webBuildPath, cordovaBuildPath].map(async (dir) => {
            try {
                const folderExists = await workspace.fs.stat(dir);
                if (!folderExists) return;

                console.log(`Removing ${dir}...`);
                await workspace.fs.delete(dir, { recursive: true });
            } catch (e) {
                // Don' throw errors from stat(), it means the path does not exists.
                console.error(e);
            }
        })
    );

    window.showInformationMessage("Successfully cleared meteor build cache.");
};

const isWindows = () => process.platform === "win32";

/**
 * When working with mono-repos, we have two options with vscode:
 * 1st - Use the multi-root workspace feature. This adds folders to the workspaceFolders.
 * 2nd - Use a normal "mono-repo", in this case we have only one root workspace.
 *
 * We need to account for those two cases. Basically check each workspaceFolder and
 * each folder from the workspace.
 */
const getMeteorProjects = () =>
    workspace.workspaceFolders.reduce(async (acc, { uri: rootUri }) => {
        const currentAcc = await acc;
        const key = rootUri.fsPath;

        if (await isMeteorProject(rootUri)) {
            currentAcc[key] = [rootUri];
            return currentAcc;
        }

        const foldersToCheck = (await workspace.fs.readDirectory(rootUri))
            .filter(([name, type]) => !!name && type === FileType.Directory)
            .map(([name]) => Uri.joinPath(rootUri, name));
        if (!foldersToCheck.length) {
            return currentAcc;
        }

        currentAcc[key] = (
            await Promise.all(
                foldersToCheck.map(async (possibleProjectPath) =>
                    (await isMeteorProject(possibleProjectPath))
                        ? possibleProjectPath
                        : null
                )
            )
        ).filter(Boolean);

        return currentAcc;
    }, Promise.resolve({}));

const fileExists = async (uri) => {
    if (!uri) {
        return false;
    }

    let exists;
    try {
        exists = !!(await workspace.fs.stat(uri));
    } catch (e) {
        exists = false;
    }

    return exists;
};

const isMeteorProject = (root) => fileExists(Uri.joinPath(root, ".meteor"));

module.exports = {
    createFileFromScratch,
    appendToExistingFile,
    toggleAutoRunPackagesWatcher,
    isWindows,
    clearMeteorBuildCache,
    isMeteorProject,
    fileExists,
    getMeteorProjects,
};
