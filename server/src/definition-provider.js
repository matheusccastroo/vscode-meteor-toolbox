const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance) {
        super(serverInstance, documentsInstance);
    }

    onDefinitionRequest({ position, textDocument: { uri } }) {
        if (this.isFileSpacebarsHTML(uri)) {
            return this.handleFileSpacebarsHTML({ uri, position });
        }
        return;
    }

    handleFileSpacebarsHTML({ uri, position }) {
        const textContentFromRequest = this.getFileContent(uri);

        const { AstWalker } = require("./ast-helpers");
        const htmlWalker = new AstWalker(
            textContentFromRequest,
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
                textContentFromRequest,
                uri,
            });
        }

        return;
    }

    handlePartialStatement({
        symbol,
        htmlWalker,
        textContentFromRequest,
        uri,
    }) {
        const { SpacebarsCompiler } = require("@blastjs/spacebars-compiler");
        const { TAG_NAMES } = require("./helpers");

        // The HTMLJS representation that Meteor uses don't allow us to get position and etc.
        // That's why we have to parse two times this input.
        const HTMLjs = SpacebarsCompiler.parse(textContentFromRequest);

        // Was the template referenced declared on the same HTML file?
        const isTemplateTagDefinedInThisHTMLFile = HTMLjs.find(
            (tag) =>
                tag.tagName === TAG_NAMES.TEMPLATE &&
                tag.attrs.name === symbol.name.original
        );

        const {
            AstWalker,
            DEFAULT_ACORN_OPTIONS,
            NODE_TYPES,
            NODE_NAMES,
        } = require("./ast-helpers");

        if (!!isTemplateTagDefinedInThisHTMLFile) {
            const _uri = this.parseUri(uri.replace(".html", ".js"));

            const { existsSync } = require("fs");
            if (!existsSync(_uri.fsPath)) {
                console.warn("Expected JS to have same name as HTML file");
                return;
            }

            const jsWalker = new AstWalker(
                this.getFileContent(_uri),
                require("acorn").parse,
                DEFAULT_ACORN_OPTIONS
            );

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

            /**
             * If the template is not defined in the JS file of the same name,
             * then we have two options:
             *
             * 1st -> It's a global template helper: TODO.
             * 2nd -> It's a template without state: in this case, we just return
             * the declaration location on the HTML file.
             */
            if (!isTemplateDefinedInJsFile) {
                let location;
                htmlWalker.walkUntil((node) => {
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
                        return htmlWalker.stopWalking();
                    }
                });

                if (!location || !location.start || !location.end) return;

                const { start, end } = location;
                return Location.create(
                    uri,
                    Range.create(start.line, start.column, end.line, end.column)
                );
            }

            /**
             * If the template is defined in the JSfile with the same name as the HTML, then we are good.
             * Just return the location of the JS file.
             */
            return Location.create(_uri.fsPath, Range.create(0, 0, 0, 0));
        }
    }
}

module.exports = {
    DefinitionProvider,
};
