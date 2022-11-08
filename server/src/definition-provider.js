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
        if (this.isFileSpacebarsJS(uri)) {
            return this.handleFileSpacebarsJS({ uri, position });
        }
        return;
    }

    handleFileSpacebarsJS({ uri, position }) {
        const { astWalker } = this.indexer.getFileInfo(uri);

        const nodeAtPosition = astWalker.getSymbolAtPosition(position);
        if (!nodeAtPosition) return;
        if (nodeAtPosition.type === "Identifier") {
            const helperToSearch = nodeAtPosition.name;
            const indexArray = this.indexer.htmlUsageMap[helperToSearch];
            if (!indexArray) return;
            const { Location, Range } = require("vscode-languageserver");

            return indexArray.map(({ node, uri }) => {
                const { start, end } = node.loc;

                return Location.create(
                    uri.path,
                    Range.create(start.line, start.column, end.line, end.column)
                );
            });
        }
        if (
            nodeAtPosition.object.type !== "MemberExpression" ||
            nodeAtPosition.object.object.name !== "Template"
        )
            return;
        const templateNameToSearch = nodeAtPosition.object.property.name;
        const index = this.indexer.templateIndexMap[templateNameToSearch];
        if (!index) return;
        const { Location, Range } = require("vscode-languageserver");
        const { start, end } = index.node.loc;

        return Location.create(
            index.uri.path,
            Range.create(start.line, start.column, end.line, end.column)
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
            return this.handleMustacheStatement({
                symbol: htmlSymbol,
                htmlWalker,
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
                    nodeProperty.name === (symbol.name?.original || symbol);

                isTemplateDefinedInJsFile = isSymbol;
                if (isTemplateDefinedInJsFile) jsWalker.stopWalking();
            }
        });

        const { Location, Range } = require("vscode-languageserver");

        const _htmlWalker = htmlWalker || this.indexer.getFileInfo(fileUri);

        if (isTemplateDefinedInJsFile) {
            /**
             * If the template is defined in the JSfile with the same name as the HTML, then we are good.
             * Just return the location of the JS file.
             */
            return Location.create(_uri.fsPath, Range.create(0, 0, 0, 0));
        }

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

    getWrappingTemplate({ uri, symbol }) {
        const { htmlJs } = this.indexer.getFileInfo(uri);
        if (!htmlJs) {
            throw new Error(
                `Expected to find htmlJs representation. Found: ${htmlJs}`
            );
        }

        const helperName = symbol.path.original;
        if (!helperName || typeof helperName !== "string") {
            throw new Error(
                `Expected to find helper name. Found: ${helperName}`
            );
        }

        // TODO -> Improve this.
        const visitHtmlChildren = (children) => {
            if (!Array.isArray(children)) return;

            for (const child of children) {
                if (typeof child === "string") continue;

                if (
                    child.__proto__.constructorName ===
                    "SpacebarsCompiler.TemplateTag"
                ) {
                    return child?.path?.includes(helperName) && child;
                }

                if (!!child.children?.length) {
                    const hasResult = visitHtmlChildren(child.children);
                    if (hasResult) return hasResult;
                }
            }
        };

        const { TAG_NAMES } = require("./helpers");
        return htmlJs.find((htmlTag) => {
            // Helpers are used only on template tags
            if (htmlTag.tagName !== TAG_NAMES.TEMPLATE) return;
            // If we don't have children, we are not using a helper.
            if (!htmlTag.children.length) return;

            return visitHtmlChildren(htmlTag.children);
        });
    }

    findHelper(templateUri, symbol) {
        const { astWalker } = this.indexer.getFileInfo(templateUri);
        if (!astWalker) {
            throw new Error(
                `Expected astWalker to exist for ${templateUri} but got ${astWalker}`
            );
        }

        const helperName = symbol.path.original;

        const { NODE_TYPES } = require("./ast-helpers");
        const { TEMPLATE_CALLERS } = require("./helpers");

        let found;
        // Search for the helper on the call expression, i.e Template.templateName.helpers({...});
        astWalker.walkUntil((node) => {
            if (!node || node.type !== NODE_TYPES.CALL_EXPRESSION) {
                return;
            }

            const callee = node.callee;
            if (
                !callee ||
                callee.type !== NODE_TYPES.MEMBER_EXPRESSION ||
                callee.property.name !== TEMPLATE_CALLERS.HELPERS
            )
                return;

            const { arguments: nodeArguments } = node;
            if (!Array.isArray(nodeArguments) || !nodeArguments.length) return;

            for (const arg of nodeArguments) {
                const { properties } = arg;
                if (!properties || !properties.length) return;

                found = properties.find((prop) => {
                    if (prop.type !== NODE_TYPES.PROPERTY) return;

                    const { key } = prop;

                    return key.name === helperName;
                });

                if (!!found) {
                    astWalker.stopWalking();
                    break;
                }
            }
        });

        return found;
    }

    handleMustacheStatement({ symbol, htmlWalker, uri }) {
        const wrappingTemplate = this.getWrappingTemplate({ uri, symbol });
        if (!wrappingTemplate) return;

        const templateSymbol = wrappingTemplate.attrs.name;
        if (!templateSymbol) {
            throw new Error(
                `Expected to find template name. Found: ${templateSymbol}`
            );
        }

        const { uri: templateUri } = this.findTemplateDefinitionOnFile({
            fileUri: uri,
            symbol: templateSymbol,
            htmlWalker,
        });

        // Means that we didn't find the template either in JS or HTML file.
        if (!templateUri) {
            console.warn(
                "Template definition not found, aborting definition request."
            );
            return;
        }

        const helper = this.findHelper(templateUri, symbol);
        if (!helper || !helper.loc) {
            console.warn(
                `Didn't found helper for symbol ${symbol.path.original}`
            );
            return;
        }

        const { Location, Range } = require("vscode-languageserver");
        const { start, end } = helper.loc;

        return Location.create(
            templateUri,
            Range.create(start.line, start.column, end.line, end.column)
        );
    }
}

module.exports = {
    DefinitionProvider,
};
