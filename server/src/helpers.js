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

    getSymbolAtPosition(position, documentUri, _tokenSeparator) {
        const tokenSeparator = _tokenSeparator || /[\s\{>}"]/;

        const range = {
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER },
        };

        const content = this.getFileContent(documentUri, range);
        const offset = position.character;

        let start = offset - 1;
        while (start > 0 && !content[start].match(tokenSeparator)) {
            start--;
        }

        let end = offset;
        while (end < content.length && !content[end].match(tokenSeparator)) {
            end++;
        }

        return content.substr(start + 1, end - start - 1);
    }
}

module.exports = {
    ServerBase,
};
