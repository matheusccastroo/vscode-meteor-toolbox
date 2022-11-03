const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance) {
        super(serverInstance, documentsInstance);
    }

    onDefinitionRequest({ position, textDocument: { uri } }) {
        const textContent = this.getFileContent(uri);

        if (this.isFileSpacebarsHTML(uri)) {
            const { parse } = require("@handlebars/parser");
            const { AstWalker, NODE_TYPES } = require("./ast-helpers");

            const walker = new AstWalker(textContent, parse);
            const symbol = walker.getSymbolAtPosition(position);

            if (!symbol) {
                console.warn("Symbol not found");
                return;
            }

            if (walker.isPartialStatement(symbol)) {
                return;
            }

            if (walker.isMustacheStatement(symbol)) {
                return;
            }
        }
    }
}

module.exports = {
    DefinitionProvider,
};
