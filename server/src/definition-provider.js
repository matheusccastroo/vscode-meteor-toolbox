const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance) {
        super(serverInstance, documentsInstance);
    }

    onDefinitionRequest({ position, textDocument: { uri } }) {
        const textContent = this.getFileContent(uri);
        const symbolClicked = this.getSymbolAtPosition(position, uri);

        if (!symbolClicked || symbolClicked.length <= 0) {
            return;
        }

        if (this.isFileSpacebarsHTML(uri)) {
            const {
                SpacebarsCompiler,
            } = require("@blastjs/spacebars-compiler");

            const parsed = SpacebarsCompiler.parse(textContent);
            console.log(parsed);
            console.log(symbolClicked);
        }
    }
}

module.exports = {
    DefinitionProvider,
};
