class ServerBase {
    static SPACEBARS_FILES_EXTENSION = {
        HTML_TEMPLATE: ".html",
        JS_TEMPLATE: ".js",
    };

    constructor(serverInstance, documentsInstance) {
        this.serverInstance = serverInstance;
        this.documentsInstance = documentsInstance;
    }

    parseUri(uri) {
        if (!uri || typeof uri !== "string") {
            throw new Error(`Wrong parameter URI. Received: ${uri}`);
        }
        const { URI } = require("vscode-uri");
        return URI.parse(uri);
    }

    getFileExtension(uri) {
        if (!uri || typeof uri !== "string") {
            throw new Error(`Wrong parameter URI. Received: ${uri}`);
        }

        const { Utils } = require("vscode-uri");

        return Utils.extname(this.parseUri(uri));
    }

    isFileSpacebarsHTML(uri) {
        return (
            this.getFileExtension(uri) ===
            ServerBase.SPACEBARS_FILES_EXTENSION.HTML_TEMPLATE
        );
    }

    isFileSpacebarsJS = (uri) => {
        return (
            this.getFileExtension(uri) ===
            ServerBase.SPACEBARS_FILES_EXTENSION.JS_TEMPLATE
        );
    };

    getFileContent(_uri, range) {
        if (!this.serverInstance) {
            throw new Error("Server instance is required to get file content");
        }

        if (!this.documentsInstance) {
            throw new Error(
                "Documents instance is required to get file content"
            );
        }

        const uri = this.parseUri(_uri);

        return this.documentsInstance.get(uri).getText(range);
    }
}

module.exports = {
    ServerBase,
};
