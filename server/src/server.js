const {
    createConnection,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocument,
} = require("vscode-languageserver/node");
const { DefinitionProvider } = require("./definition-provider");

class ServerInstance {
    constructor() {
        // Create a connection for the server, using Node's IPC as a transport.
        // Also include all preview / proposed LSP features.
        this.connection = createConnection(ProposedFeatures.all);
        this.definitionProvider = new DefinitionProvider(this);

        this.connection.onInitialize(() => ({
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,

                definitionProvider: true,
                completionProvider: {
                    resolveProvider: true,
                },
            },
        }));

        this.connection.onDefinition(
            this.definitionProvider.onDefinitionRequest
        );
        this.connection.listen();
    }
}

new ServerInstance();
