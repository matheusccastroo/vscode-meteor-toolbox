class ServerBase {
    static SPACEBARS_FILES_EXTENSION = {
        HTML_TEMPLATE: ".html",
        JS_TEMPLATE: ".js",
    };

    constructor(serverInstance) {
        this.serverInstance = serverInstance;
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

    getFileContent(_uri) {
        if (!this.serverInstance) {
            throw new Error("Server instance is required to get file content");
        }

        const uri = this.parseUri(_uri);

        return this.serverInstance.documents.get(uri);
    }
}

module.exports = {
    ServerBase,
};
