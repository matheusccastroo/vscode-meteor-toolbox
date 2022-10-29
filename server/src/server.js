const {
    createConnection,
    ProposedFeatures,
    TextDocumentSyncKind,
} = require("vscode-languageserver/node");
const { DefinitionProvider } = require("./definition-provider");

class ServerInstance {
    constructor() {
        // Create a connection for the server, using Node's IPC as a transport.
        // Also include all preview / proposed LSP features.
        this.connection = createConnection(ProposedFeatures.all);
        this.definitionProvider = new DefinitionProvider(this.connection);

        this.connection.onInitialize(() => ({
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,

                definitionProvider: true,
                completionProvider: {
                    resolveProvider: true,
                },
            },
        }));

        this.connection.onDefinition((...params) =>
            this.definitionProvider.onDefinitionRequest(...params)
        );
        this.connection.listen();
    }
}

new ServerInstance();
