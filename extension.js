const vscode = require("vscode");
const {
    addDebugAndRunOptions,
    generateBaseJsConfig,
} = require("./src/base-configs");
const {
    toggleAutoRunPackagesWatcher,
    clearMeteorBuildCache,
    getMeteorProjects,
} = require("./src/helpers");
const {
    addImportedPackagesToJsConfig,
    addCustomPackageOptionsToJsConfig,
} = require("./src/packages-config");
const {
    connectToLanguageServer,
    stopServer,
} = require("./src/connect-to-server");

const createOrUpdateJsConfigFile = async (workspaceUri, projectUri) => {
    await generateBaseJsConfig(workspaceUri, projectUri);
    await addImportedPackagesToJsConfig(workspaceUri, projectUri);
    await addCustomPackageOptionsToJsConfig(workspaceUri);
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
async function activate(context) {
    const meteorProjectsByWorkspace = await getMeteorProjects();
    if (!Object.keys(meteorProjectsByWorkspace).length) {
        console.error(
            "No meteor projects found, not starting Meteor Toolbox extension..."
        );
        return;
    }

    console.log("Starting Meteor Toolbox extension...");

    for (const workspaceKey in meteorProjectsByWorkspace) {
        if (
            !Object.hasOwnProperty.call(meteorProjectsByWorkspace, workspaceKey)
        ) {
            continue;
        }

        const workspaceUri = vscode.Uri.file(workspaceKey);
        const meteorProjects = meteorProjectsByWorkspace[workspaceKey];
        if (!meteorProjects.length) continue;

        for (const project of meteorProjects) {
            await addDebugAndRunOptions(workspaceUri, project);
            await createOrUpdateJsConfigFile(workspaceUri, project);
        }
    }

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

            return createOrUpdateJsConfigFile();
        }
    );

    console.log(
        `Packages file watcher is ${autoEnabled ? "enabled" : "disabled"}`
    );

    if (autoEnabled) {
        for (const workspaceKey in meteorProjectsByWorkspace) {
            if (
                !Object.hasOwnProperty.call(
                    meteorProjectsByWorkspace,
                    workspaceKey
                )
            ) {
                return;
            }

            const currentWorkspace = vscode.Uri.file(workspaceKey);
            importedPackagesFileWatcher =
                vscode.workspace.createFileSystemWatcher(
                    new vscode.RelativePattern(
                        currentWorkspace,
                        ".meteor/{packages, versions}"
                    )
                );
            customPackagesFileWatcher =
                vscode.workspace.createFileSystemWatcher(
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
        }
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
        await connectToLanguageServer(context.asAbsolutePath)
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
    stopServer();
}

module.exports = {
    activate,
    deactivate,
};
