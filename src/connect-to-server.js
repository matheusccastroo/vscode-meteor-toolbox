let client;
const connectToLanguageServer = async (asAbsolutePath) => {
    console.log("Connecting to language server...");

    const {
        TransportKind,
        LanguageClient,
    } = require("vscode-languageclient/node");
    const path = require("path");

    const serverModule = asAbsolutePath(
        path.join("server", "src", "server.js")
    );

    const defaultServerOptions = {
        module: serverModule,
        transport: TransportKind.ipc,
    };
    const serverOptions = {
        run: defaultServerOptions,
        debug: {
            ...defaultServerOptions,
            options: { execArgv: ["--nolazy", "--inspect=6009"] },
        },
    };

    const clientOptions = {
        documentSelector: [
            { scheme: "file", language: "html" },
            { scheme: "file", language: "javascript" },
            { scheme: "file", language: "spacebars" },
        ],
        synchronize: {
            configurationSection: "conf.settingsEditor.meteorToolbox",
        },
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        "meteor-language-server",
        "Meteor Language Server",
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    await client.start();
    setupNotifications();

    console.log("Connected to the server!");
    return client;
};

const setupNotifications = () => {
    if (!client) {
        throw new Error(
            "Too soon to setup notifications, wait for the server connection."
        );
    }

    client.onNotification("errors/parsing", (filesPath) => {
        if (!filesPath) {
            return;
        }

        const { window } = require("vscode");
        window.showErrorMessage(
            `Meteor Toolbox was unable to parse the following files: ${filesPath}.
             If parsing errors are expected for such files, remember to add them to the excluded files list on the extension settings.`
        );
    });
};

const stopServer = () => {
    if (!client) return;
    client.stop();
};

module.exports = { connectToLanguageServer, stopServer };
