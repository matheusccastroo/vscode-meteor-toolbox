const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance, rootUri, indexer) {
        super(serverInstance, documentsInstance, rootUri);

        this.indexer = indexer;
    }

    onDefinitionRequest({ position, textDocument: { uri } }) {
        if (this.isFileSpacebarsHTML(uri)) {
            return this.handleFileSpacebarsHTML({ uri, position });
        }
        return;
    }

    handleFileSpacebarsHTML({ uri, position }) {
        const { AstWalker } = require("./ast-helpers");
        const htmlWalker = new AstWalker(
            this.getFileContent(uri),
            require("@handlebars/parser").parse
        );
        const htmlSymbol = htmlWalker.getSymbolAtPosition(position);

        if (!htmlSymbol) {
            console.warn("HTML Symbol not found");
            return;
        }

        if (htmlWalker.isPartialStatement(htmlSymbol)) {
            return this.handlePartialStatement({
                symbol: htmlSymbol,
                htmlWalker,
                uri,
            });
        }

        if (htmlWalker.isMustacheStatement(htmlSymbol)) {
            return;
        }

        return;
    }

    /**
     * Create a HTMLJS representation of the template and then check if the template is defined
     * on this file.
     * @param {*} fileUri
     * @param {*} templateNameOrNode
     * @returns
     */
    isTemplateDefinedOnHTMLFile(fileUri, templateNameOrNode) {
        if (!fileUri || !templateNameOrNode) {
            throw new Error("Missing required parameters");
        }

        const { htmlJs } = this.indexer.getFileInfo(fileUri);
        if (!htmlJs) {
            throw new Error(
                `HTML JS does not exists for file ${
                    this.parseUri(fileUri).fsPath
                }`
            );
        }

        const _searchValue =
            typeof templateNameOrNode === "string"
                ? templateNameOrNode
                : templateNameOrNode.name.original;

        const { TAG_NAMES } = require("./helpers");
        // Was the template referenced declared on the same HTML file?
        return htmlJs.find(
            (tag) =>
                tag.tagName === TAG_NAMES.TEMPLATE &&
                tag.attrs.name === _searchValue
        );
    }

    /**
     * Tries to search first in the .JS file of the template.
     * If nothing is found, it treat as a stateless template, which return the HTML location.
     * @param {*} param0
     * @returns
     */
    findTemplateDefinitionOnFile({ fileUri, symbol, htmlWalker }) {
        // Can be string or URI object.
        const _uri = this.parseUri(
            (fileUri.fsPath || fileUri).replace(".html", ".js")
        );

        const { existsSync } = require("fs");
        if (!existsSync(_uri.fsPath)) {
            console.warn("Expected JS to have same name as HTML file");
            return;
        }

        const { NODE_NAMES, NODE_TYPES } = require("./ast-helpers");

        const { astWalker: jsWalker } = this.indexer.getFileInfo(_uri);

        let isTemplateDefinedInJsFile = false;
        jsWalker.walkUntil((node) => {
            if (!node) return;

            if (
                node.type === NODE_TYPES.MEMBER_EXPRESSION &&
                node.object.type === NODE_TYPES.MEMBER_EXPRESSION
            ) {
                const supposedTemplate = node.object.object;
                const isTemplate =
                    supposedTemplate.name === NODE_NAMES.TEMPLATE &&
                    supposedTemplate.type === NODE_TYPES.IDENTIFIER;

                if (!isTemplate) return;

                const nodeProperty = node.object.property;
                const isSymbol =
                    nodeProperty.type === NODE_TYPES.IDENTIFIER &&
                    nodeProperty.name === symbol.name.original;

                isTemplateDefinedInJsFile = isSymbol;
                if (isTemplateDefinedInJsFile) jsWalker.stopWalking();
            }
        });

        const { Location, Range } = require("vscode-languageserver");

        const _htmlWalker = htmlWalker || this.indexer.getFileInfo(fileUri);

        /**
         * If the template is not defined in the JS file of the same name,
         * it's a template without state: in this case, we just return
         * the declaration location on the HTML file.
         */
        if (!isTemplateDefinedInJsFile) {
            let location;
            _htmlWalker.walkUntil((node) => {
                if (!node) return;

                if (
                    node.type === NODE_TYPES.CONTENT_STATEMENT &&
                    typeof node.original === "string"
                ) {
                    const valueToCheck = node.original;
                    const symbolString = symbol.name.original;

                    // Try with both "" and ''
                    const includes =
                        valueToCheck.includes(
                            `template name="${symbolString}"`
                        ) ||
                        valueToCheck.includes(
                            `template name='${symbolString}'`
                        );

                    if (!includes) return;

                    location = node.loc;
                    return _htmlWalker.stopWalking();
                }
            });

            if (!location || !location.start || !location.end) return;

            const { start, end } = location;
            return Location.create(
                fileUri,
                Range.create(start.line, start.column, end.line, end.column)
            );
        }

        /**
         * If the template is defined in the JSfile with the same name as the HTML, then we are good.
         * Just return the location of the JS file.
         */
        return Location.create(_uri.fsPath, Range.create(0, 0, 0, 0));
    }

    handlePartialStatement({ symbol, htmlWalker, uri }) {
        /**
         * Is the template defined in the same HTML file that initiated the request?
         */
        if (!!this.isTemplateDefinedOnHTMLFile(uri, symbol)) {
            return this.findTemplateDefinitionOnFile({
                fileUri: uri,
                symbol,
                htmlWalker,
            });
        }

        /**
         * OK, we need to search for the template.
         * Loop through each HTML file starting from the current open file directory searching for
         * the <template name="nameHere"> tag. If we find it, search for the JS file that implements it
         * and return it's location
         */
        const { FILE_EXTENSIONS } = require("./helpers");
        const htmlSources = this.indexer.getSourcesOfType(FILE_EXTENSIONS.HTML);

        for (const { uri } of htmlSources) {
            if (!this.isTemplateDefinedOnHTMLFile(uri, symbol)) continue;

            return this.findTemplateDefinitionOnFile({ fileUri: uri, symbol });
        }

        /**
         * Well, we tried but we didn't find anything useful.
         */
        return;
    }
}

module.exports = {
    DefinitionProvider,
};
