// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const {
    addDebugAndRunOptions,
    generateBaseJsConfig,
} = require("./src/base-configs");
const {
    toggleAutoRunPackagesWatcher,
    clearMeteorBuildCache,
} = require("./src/helpers");
const {
    addImportedPackagesToJsConfig,
    addCustomPackageOptionsToJsConfig,
} = require("./src/packages-config");

const createOrUpdateJsConfigFile = () => {
    generateBaseJsConfig();
    addImportedPackagesToJsConfig();
    addCustomPackageOptionsToJsConfig();
};

let importedPackagesFileWatcher;
let customPackagesFileWatcher;

const disposeWatchers = () =>
    [importedPackagesFileWatcher, customPackagesFileWatcher].forEach(
        (watcher) => watcher?.dispose?.()
    );

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log("Starting Meteor Toolbox extension...");

    addDebugAndRunOptions();
    createOrUpdateJsConfigFile();

    const toggleAutoRunPackagesWatcherDisposable =
        vscode.commands.registerCommand(
            "config.commands.meteorToolbox.toggleAutoRunPackagesWatcher",
            toggleAutoRunPackagesWatcher
        );

    const autoEnabled = vscode.workspace
        .getConfiguration()
        .get("conf.settingsEditor.meteorToolbox.auto");

    const clearMeteorBuildCacheDisposable = vscode.commands.registerCommand(
        "config.commands.meteorToolbox.clearMeteorBuildCache",
        clearMeteorBuildCache
    );

    const regenerateLaunchJsonDisposable = vscode.commands.registerCommand(
        "config.commands.meteorToolbox.regenerateLaunchJson",
        addDebugAndRunOptions
    );

    const runOnceDisposable = vscode.commands.registerCommand(
        "config.commands.meteorToolbox.runOnce",
        () => {
            if (autoEnabled) {
                vscode.window.showInformationMessage(
                    "We are already watching your packages folder, no need to run the command manually."
                );
                return;
            }

            createOrUpdateJsConfigFile();
        }
    );

    console.log(
        `Packages file watcher is ${autoEnabled ? "enabled" : "disabled"}`
    );

    if (autoEnabled) {
        const currentWorkspace = vscode.workspace.workspaceFolders[0];
        importedPackagesFileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                currentWorkspace,
                ".meteor/{packages, versions}"
            )
        );
        customPackagesFileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                currentWorkspace,
                "packages/**/package.js"
            )
        );

        [importedPackagesFileWatcher, customPackagesFileWatcher].forEach(
            (watcher) => {
                watcher.onDidChange(createOrUpdateJsConfigFile);
                watcher.onDidCreate(createOrUpdateJsConfigFile);
                watcher.onDidDelete(createOrUpdateJsConfigFile);
            }
        );
    } else {
        disposeWatchers();
    }

    const restartDisposer = vscode.commands.registerCommand(
        "_meteorToolbox.reloadExtension",
        () => {
            deactivate();
            for (const sub of context.subscriptions) {
                try {
                    sub.dispose();
                } catch (e) {
                    console.error(e);
                }
            }
            activate(context);
        }
    );

    context.subscriptions.push(
        toggleAutoRunPackagesWatcherDisposable,
        runOnceDisposable,
        restartDisposer,
        clearMeteorBuildCacheDisposable,
        regenerateLaunchJsonDisposable
    );
}

// this method is called when your extension is deactivated
function deactivate() {
    disposeWatchers();
}

module.exports = {
    activate,
    deactivate,
};
