let client;
const connectToLanguageServer = (asAbsolutePath) => {
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
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        "meteor-language-server",
        "Meteor Language Server",
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();
};

const stopServer = () => {
    if (!client) return;
    client.stop();
};

module.exports = { connectToLanguageServer, stopServer };
