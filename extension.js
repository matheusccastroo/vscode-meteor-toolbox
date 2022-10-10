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

const vscode_1 = require("vscode");
const path = require("path");
const node_1 = require("vscode-languageclient/node");

let client;
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log("Starting Meteor Toolbox extension...");
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join("spacebars", "server", "out", "server.js")
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: debugOptions,
        },
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for plain text documents
        documentSelector: [
            { scheme: "file", language: "html" },
            { scheme: "file", language: "javascript" },
        ],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents:
                vscode_1.workspace.createFileSystemWatcher("**/.clientrc"),
        },
    };
    // Create the language client and start the client.
    client = new node_1.LanguageClient(
        "languageServerExample",
        "Language Server Example",
        serverOptions,
        clientOptions
    );
    // Start the client. This will also launch the server
    client.start();

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
    if (!client) {
        return undefined;
    }
    return client.stop();
}

module.exports = {
    activate,
    deactivate,
};
