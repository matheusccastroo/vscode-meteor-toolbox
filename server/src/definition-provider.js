const { loadAllSources } = require("./fs");
const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance, rootUri) {
        super(serverInstance, documentsInstance, rootUri);
    }

    async reindex(){
        console.info(`Reindexing ${this.rootUri}`)
        const sources = await loadAllSources(this.files)
        console.info(
            `* Found ${sources.length} source files`
          )
          //TODO: parsear todos os arquivos aqui
      
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

        const { SpacebarsCompiler } = require("@blastjs/spacebars-compiler");
        const { TAG_NAMES } = require("./helpers");

        // The HTMLJS representation that Meteor uses don't allow us to get position and etc.
        // That's why we have to parse two times this input.
        const HTMLjs = SpacebarsCompiler.parse(this.getFileContent(fileUri));

        const _searchValue =
            typeof templateNameOrNode === "string"
                ? templateNameOrNode
                : templateNameOrNode.name.original;

        // Was the template referenced declared on the same HTML file?
        return HTMLjs.find(
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

        const {
            AstWalker,
            NODE_NAMES,
            NODE_TYPES,
            DEFAULT_ACORN_OPTIONS,
        } = require("./ast-helpers");

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

        const _htmlWalker =
            htmlWalker ||
            new AstWalker(
                this.getFileContent(fileUri),
                require("@handlebars/parser").parse
            );

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
        const { Utils } = require("vscode-uri");
        const glob = require("glob");

        const rootUri = this.parseUri(this.rootUri);
        let currentDirectory = Utils.dirname(this.parseUri(uri));

        const goUp = () => {
            currentDirectory = Utils.joinPath(currentDirectory, "../");
        };

        while (currentDirectory.fsPath.startsWith(rootUri.fsPath)) {
            const htmlFilesInDirectory = glob.sync("*.html", {
                cwd: currentDirectory.fsPath,
            });

            if (!htmlFilesInDirectory.length) {
                goUp();
                continue;
            }

            for (const fileName of htmlFilesInDirectory) {
                const fileUri = Utils.joinPath(currentDirectory, fileName);
                const fileContent = this.getFileContent(fileUri);

                if (!fileContent) {
                    continue;
                }

                if (!this.isTemplateDefinedOnHTMLFile(fileUri, symbol))
                    continue;

                return this.findTemplateDefinitionOnFile({ fileUri, symbol });
            }

            goUp();
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
