const {
    createConnection,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
} = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");
const { DefinitionProvider } = require("./definition-provider");
const { NodeFiles } = require("./node-files");

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
            if (params.rootPath) {
                this.rootUri = `file://${params.rootPath}`;
            } else if (params.rootUri) {
                this.rootUri = params.rootUri;
            } else if (
                params.workspaceFolders &&
                params.workspaceFolders.length > 0
            ) {
                this.rootUri = params.workspaceFolders[0].uri;
            } else {
                this.connection.console.error(`Could not determine rootPath`);
            }

            this.definitionProvider.files = new NodeFiles(this.rootUri);

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
        this.connection.onInitialized(() => {
            console.info("initialized");
            this.definitionProvider
                .reindex()
                .catch((err) => console.error(err.message));
        });

        this.documents.listen(this.connection);
        this.connection.onDidChangeWatchedFiles();
        this.documents.onDidChangeContent(async (change) => {
            this.scheduleReindexing();
        });

        this.connection.listen();
    }
    scheduleReindexing() {
        clearTimeout(this.reindexingTimeout);
        const timeoutMillis = 3000;
        this.connection.console.info(
            `Scheduling reindexing in ${timeoutMillis} ms`
        );
        this.reindexingTimeout = setTimeout(() => {
            this.definitionProvider.reindex().catch((err) =>
                console.error(
                    `Failed to reindex: ${err.message}`
                )
            );
        }, timeoutMillis);
    }
}

new ServerInstance();
