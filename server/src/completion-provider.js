const { ServerBase } = require("./helpers");

class CompletionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance, rootUri, indexer) {
        super(serverInstance, documentsInstance, rootUri, indexer);
    }

    // TODO -> Should we trigger only with triggerCharacter?
    onCompletionRequest({ textDocument: { uri }, position }) {
        if (this.isFileJS(uri)) {
            return this.handleJsCompletion({ uri, position });
        }

        if (this.isFileSpacebarsHTML(uri)) {
            return this.handleHtmlCompletion({ uri, position });
        }

        return;
    }

    handleJsCompletion({ uri, position }) {
        // Parse the file, since the index may be outdated already.
        const {
            AstWalker,
            DEFAULT_ACORN_OPTIONS,
            NODE_NAMES,
            NODE_TYPES,
        } = require("./ast-helpers");
        // Parse with accorn-loose because the input can be syntatically wrong.
        const astWalker = new AstWalker(
            this.getFileContent(uri),
            require("acorn-loose").parse,
            DEFAULT_ACORN_OPTIONS
        );

        const { line, character } = position;
        const nodeAtPosition = astWalker.getSymbolAtPosition({
            line,
            character: character - 1,
        });
        if (!nodeAtPosition) return;

        if (
            nodeAtPosition.type !== NODE_TYPES.IDENTIFIER ||
            nodeAtPosition.name !== NODE_NAMES.TEMPLATE
        ) {
            return;
        }

        const {
            CompletionItemKind,
            CompletionItem,
        } = require("vscode-languageserver");

        return Object.keys(this.indexer.blazeIndexer.templateIndexMap).map(
            (templateName) => ({
                ...CompletionItem.create(templateName),
                textEdit: templateName,
                kind: CompletionItemKind.Class,
                detail: NODE_NAMES.TEMPLATE,
            })
        );
    }

    handleHtmlCompletion({ uri, position }) {
        const {
            CompletionItem,
            CompletionItemKind,
        } = require("vscode-languageserver");
        const { NODE_NAMES } = require("./ast-helpers");

        // TODO -> Offer completion of helpers.
        return Object.keys(this.indexer.blazeIndexer.templateIndexMap).map(
            (templateName) => ({
                ...CompletionItem.create(templateName),
                textEdit: templateName,
                kind: CompletionItemKind.Class,
                documentation: NODE_NAMES.TEMPLATE,
            })
        );
    }
}

module.exports = { CompletionProvider };
