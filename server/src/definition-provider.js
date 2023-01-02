const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance, rootUri, indexer) {
        super(serverInstance, documentsInstance, rootUri, indexer);
    }

    onDefinitionRequest({ position, textDocument: { uri } }) {
        if (this.isFileSpacebarsHTML(uri)) {
            return this.handleFileSpacebarsHTML({ uri, position });
        }

        if (this.isFileJS(uri)) {
            return this.handleFileJS({ uri, position });
        }

        return;
    }

    handleFileJS({ uri, position }) {
        const { astWalker } = this.indexer.getFileInfo(uri);

        const nodeAtPosition = astWalker.getSymbolAtPosition(position);
        if (!nodeAtPosition) {
            console.warn("NodeAtPosition not found");
            return;
        }

        const { NODE_TYPES } = require("./ast-helpers");
        const { Location, Range } = require("vscode-languageserver");

        if (nodeAtPosition.type !== NODE_TYPES.LITERAL) {
            const { start, end } = nodeAtPosition.loc;

            return Location.create(
                this.parseUri(uri).path,
                Range.create(
                    start.line - 1,
                    start.column,
                    end.line - 1,
                    end.column
                )
            );
        }

        // If it's a string literal, we check for methods and publications
        const literalValue = nodeAtPosition.value;
        const { node: { loc: { start, end } = {} } = {}, uri: literalUri } =
            this.indexer.stringLiteralsIndexer.getLiteralInfo(literalValue);
        if (!start || !end || !literalUri) {
            console.warn(`Didn't find definition for ${nodeAtPosition}`);
            return;
        }

        return Location.create(
            literalUri.path,
            Range.create(start.line - 1, start.column, end.line - 1, end.column)
        );
    }

    handleFileSpacebarsHTML({ uri, position }) {
        const { AstWalker } = require("./ast-helpers");
        const htmlWalker = new AstWalker(
            this.getFileContent(uri),
            require("@handlebars/parser").parse
        );
        const htmlSymbol = htmlWalker.getSymbolAtPosition(position);

        if (!htmlSymbol) {
            console.warn(
                `HTML Symbol not found for position ${JSON.stringify(
                    position,
                    undefined,
                    2
                )}. File uri is: ${uri}`
            );
            return;
        }

        if (htmlWalker.isPartialStatement(htmlSymbol)) {
            return this.handlePartialStatement({
                symbol: htmlSymbol,
                htmlWalker,
                uri,
            });
        }

        if (
            htmlWalker.isPathExpression(htmlSymbol) ||
            htmlWalker.isMustacheStatement(htmlSymbol)
        ) {
            return this.handleMustacheStatement({
                symbol: htmlSymbol,
                uri,
            });
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

        const { TAG_NAMES } = require("./constants");
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
                    nodeProperty.name === (symbol.name?.original || symbol);

                isTemplateDefinedInJsFile = isSymbol;
                if (isTemplateDefinedInJsFile) jsWalker.stopWalking();
            }
        });

        const { Location, Range } = require("vscode-languageserver");

        if (isTemplateDefinedInJsFile) {
            /**
             * If the template is defined in the JSfile with the same name as the HTML, then we are good.
             * Just return the location of the JS file.
             */
            return Location.create(_uri.fsPath, Range.create(0, 0, 0, 0));
        }

        const _htmlWalker =
            htmlWalker || this.indexer.getFileInfo(fileUri).astWalker;
        /**
         * If the template is not defined in the JS file of the same name,
         * it's a template without state: in this case, we just return
         * the declaration location on the HTML file.
         */
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
                    valueToCheck.includes(`template name="${symbolString}"`) ||
                    valueToCheck.includes(`template name='${symbolString}'`);

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
         */
        const { uri: templateUri } =
            this.indexer.blazeIndexer.getTemplateInfo(symbol);

        /**
         * Well, we tried but we didn't find anything useful.
         */
        if (!templateUri) return;

        const { Location, Range } = require("vscode-languageserver");

        // TODO -> Handle stateless templates defined just on HTML.
        return Location.create(
            this.parseUri(templateUri).fsPath.replace(".html", ".js"),
            Range.create(0, 0, 0, 0)
        );
    }

    getWrappingTemplate({ uri, symbol }) {
        const { htmlJs } = this.indexer.getFileInfo(uri);
        if (!htmlJs) {
            throw new Error(
                `Expected to find htmlJs representation. Found: ${htmlJs}`
            );
        }

        const helperName =
            (typeof symbol === "string" && symbol) ||
            symbol.parts?.[0] ||
            symbol.path?.parts?.[0] ||
            symbol.path?.original ||
            symbol.original;
        if (!helperName || typeof helperName !== "string") {
            throw new Error(
                `Expected to find helper name. Found: ${helperName}`
            );
        }

        const findSymbol = (node) => {
            if (node === helperName) return node;

            if (Array.isArray(node)) {
                for (const _n of node) {
                    const ret = findSymbol(_n);
                    if (ret) return ret;
                }
            }

            if (typeof node === "object") {
                for (const key in node) {
                    if (Object.hasOwnProperty.call(node, key)) {
                        const ret = findSymbol(node[key]);
                        if (ret) return ret;
                    }
                }
            }
        };

        const visitHtmlChildren = (children) => {
            if (!Array.isArray(children)) return;

            for (const child of children) {
                if (typeof child === "string") continue;

                const foundSymbol = findSymbol(child);
                if (foundSymbol) return foundSymbol;

                if (!!child.children?.length) {
                    const hasResult = visitHtmlChildren(child.children);
                    if (hasResult) return hasResult;
                }
            }
        };

        const { TAG_NAMES } = require("./constants");
        if (Array.isArray(htmlJs)) {
            return htmlJs.find((htmlTag) => {
                // Helpers are used only on template tags
                if (htmlTag.tagName !== TAG_NAMES.TEMPLATE) return;
                // If we don't have children, we are not using a helper.
                if (!htmlTag.children.length) return;

                return visitHtmlChildren(htmlTag.children);
            });
        }

        return visitHtmlChildren(htmlJs.children) && htmlJs;
    }

    handleMustacheStatement({ symbol, uri }) {
        const wrappingTemplate = this.getWrappingTemplate({ uri, symbol });
        if (!wrappingTemplate) return;

        const templateName = wrappingTemplate.attrs.name;
        if (!templateName) {
            throw new Error(
                `Expected to find template name. Found: ${templateName}`
            );
        }

        const helper = this.indexer.blazeIndexer.getHelperFromTemplateName(
            templateName,
            symbol
        );

        const { start, end } = helper || {};
        if (!start || !end) {
            console.warn(
                `Didn't found helper for symbol ${symbol.path.original}`
            );
            return;
        }

        const { Location, Range } = require("vscode-languageserver");

        // TODO -> Should we check if the JS file exists?
        return Location.create(
            this.parseUri(uri).fsPath.replace(".html", ".js"),
            Range.create(start.line - 1, start.column, end.line - 1, end.column)
        );
    }
}

module.exports = {
    DefinitionProvider,
};
