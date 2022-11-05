const {
    createConnection,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
} = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");
const { DefinitionProvider } = require("./definition-provider");

class ServerInstance {
    constructor() {
        // Create a connection for the server, using Node's IPC as a transport.
        // Also include all preview / proposed LSP features.
        this.connection = createConnection(ProposedFeatures.all);
        this.documents = new TextDocuments(TextDocument);

        this.connection.onInitialize((params) => {
            this.rootUri = params.rootUri;

            this.definitionProvider = new DefinitionProvider(
                this.connection,
                this.documents,
                this.rootUri
            );

            return {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Incremental,

                    definitionProvider: true,
                    completionProvider: {
                        resolveProvider: true,
                    },
                },
            };
        });

        this.connection.onDefinition((...params) =>
            this.definitionProvider.onDefinitionRequest(...params)
        );

        this.documents.listen(this.connection);
        this.connection.listen();
    }
}

new ServerInstance();
