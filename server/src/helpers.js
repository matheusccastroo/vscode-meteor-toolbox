class ServerBase {
    static SPACEBARS_FILES_EXTENSION = {
        HTML_TEMPLATE: ".html",
        JS_TEMPLATE: ".js",
    };

    constructor(serverInstance, documentsInstance, rootUri, indexer) {
        this.serverInstance = serverInstance;
        this.documentsInstance = documentsInstance;
        this.rootUri = this.parseUri(rootUri);
        this.indexer = indexer;
    }

    parseUri(uri) {
        if (!uri) {
            throw new Error("Missing URI parameter");
        }

        const { URI } = require("vscode-uri");

        return uri instanceof URI ? uri : URI.parse(uri);
    }

    getFileExtension(uri) {
        if (!uri) {
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

    isFileJS = (uri) => {
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

        const fromDocumentInstance = this.documentsInstance.get(uri);
        if (!!fromDocumentInstance) {
            return fromDocumentInstance.getText(range);
        }

        return require("fs").readFileSync(uri.fsPath, { encoding: "utf-8" });
    }

    getFileContentPromise(_uri) {
        if (!_uri) {
            throw new Error("_uri is required");
        }

        // Parse to get the correct fsPath that works on all OS's.
        const uri = this.parseUri(_uri);

        return require("fs/promises").readFile(uri.fsPath, {
            encoding: "utf-8",
        });
    }
}

module.exports = {
    ServerBase,
};
