const {
    createConnection,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
} = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");
const { DefinitionProvider } = require("./definition-provider");
const { CompletionProvider } = require("./completion-provider");
const { ReferencesProvider } = require("./references-provider");
const { Indexer } = require("./indexer");

class ServerInstance {
    constructor() {
        // Create a connection for the server, using Node's IPC as a transport.
        // Also include all preview / proposed LSP features.
        this.connection = createConnection(ProposedFeatures.all);
        this.documents = new TextDocuments(TextDocument);

        this.connection.onInitialize(async (params) => {
            this.rootUri =
                params.rootUri ||
                (params.rootPath && `file://${params.rootPath}`);

            if (!this.rootUri) {
                console.error("Not able to found rootUri");
                return;
            }

            this.indexer = new Indexer({
                rootUri: this.rootUri,
                serverInstance: this.connection,
                documentsInstance: this.documents,
            });

            // Create the "index"
            await this.indexer.reindex();

            this.definitionProvider = new DefinitionProvider(
                this.connection,
                this.documents,
                this.rootUri,
                this.indexer
            );
            this.completionProvider = new CompletionProvider(
                this.connection,
                this.documents,
                this.rootUri,
                this.indexer
            );
            this.referencesProvider = new ReferencesProvider(
                this.connection,
                this.documents,
                this.rootUri,
                this.indexer
            );

            return {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Incremental,
                    definitionProvider: true,
                    referencesProvider: true,
                    completionProvider: {
                        resolveProvider: "true",
                        triggerCharacters: ["."],
                    },
                },
            };
        });

        // Reindex on file changes
        this.connection.onDidChangeWatchedFiles(() =>
            this.scheduleReindexing()
        );
        this.documents.onDidChangeContent(() => this.scheduleReindexing());

        this.connection.onDefinition((...params) =>
            this.definitionProvider.onDefinitionRequest(...params)
        );
        this.connection.onCompletion((...params) =>
            this.completionProvider.onCompletionRequest(...params)
        );
        this.connection.onReferences((...params) =>
            this.referencesProvider.onReferenceRequest(...params)
        );
        this.connection.onDidChangeConfiguration((...params) =>
            this.indexer.onDidChangeConfiguration(...params)
        );
        // TODO -> implement completion resolver?.
        // this.connection.onCompletionResolve(() => {});

        this.documents.listen(this.connection);

        this.connection.listen();
    }

    scheduleReindexing() {
        if (this.reindexingTimeout) {
            clearTimeout(this.reindexingTimeout);
        }

        const timeoutMs = 3000;
        this.connection.console.info(
            `Scheduling reindexing in ${timeoutMs} ms`
        );

        this.reindexingTimeout = setTimeout(() => {
            this.indexer
                .reindex()
                .catch((err) =>
                    console.error(`Failed to reindex: ${err.message}`)
                );
        }, timeoutMs);
    }
}

new ServerInstance();
