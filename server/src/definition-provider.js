const { ServerBase } = require("./helpers");

class DefinitionProvider extends ServerBase {
    constructor(serverInstance) {
        super(serverInstance);
    }

    onDefinitionRequest(params) {
        console.log(params);
    }
}

module.exports = {
    DefinitionProvider,
};
