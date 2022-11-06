const {
    createConnection,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
} = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");
const { DefinitionProvider } = require("./definition-provider");
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
            await this.indexer.loadSources();

            this.definitionProvider = new DefinitionProvider(
                this.connection,
                this.documents,
                this.rootUri,
                this.indexer
            );

            return {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Incremental,

                    definitionProvider: true,
                    // We don't support completion for now.
                    // completionProvider: {
                    //     resolveProvider: true,
                    // },
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
        this.documents.listen(this.connection);

        this.connection.listen();
    }

    async reindex() {
        console.info(`* Reindexing project: ${this.rootUri}`);
        await this.indexer.loadSources();
        console.info("* Reindexing completed.");
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
            this.reindex().catch((err) =>
                console.error(`Failed to reindex: ${err.message}`)
            );
        }, timeoutMs);
    }
}

new ServerInstance();
