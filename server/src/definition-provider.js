const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance, documentsInstance) {
        super(serverInstance, documentsInstance);
    }

    onDefinitionRequest({ position, textDocument: { uri } }) {
        const textContent = this.getFileContent(uri);
        console.log(textContent);
    }
}

module.exports = {
    DefinitionProvider,
};
