const { ServerBase } = require("./helpers");

class ReferencesProvider extends ServerBase {
    constructor(serverInstance, documentsInstance, rootUri, indexer) {
        super(serverInstance, documentsInstance, rootUri, indexer);
    }

    onReferenceRequest({ position, textDocument: { uri } }) {
        if (!this.isFileJS(uri)) {
            return;
        }

        const { astWalker } = this.indexer.getFileInfo(uri);
        const nodeAtPosition = astWalker.getSymbolAtPosition(position);
        if (!nodeAtPosition) {
            console.warn(
                `Nothing found for the specified position: ${JSON.stringify(
                    position,
                    undefined,
                    2
                )}`
            );
            return;
        }

        const { NODE_TYPES, NODE_NAMES } = require("./ast-helpers");
        const { Location, Range } = require("vscode-languageserver");

        // If it's a string literal, we check for methods and publications references
        if (nodeAtPosition.type === NODE_TYPES.LITERAL) {
            const literalValue = nodeAtPosition.value;
            const usageInfoArray =
                this.indexer.stringLiteralsIndexer.getUsageInfo(literalValue);
            if (!Array.isArray(usageInfoArray) || !usageInfoArray.length) {
                console.warn(`No references found for ${literalValue}`);
                return;
            }

            return usageInfoArray.map(({ node, uri }) => {
                const { start, end } = node.loc;

                return Location.create(
                    uri.path,
                    Range.create(
                        start.line - 1,
                        start.column,
                        end.line - 1,
                        end.column
                    )
                );
            });
        }

        if (nodeAtPosition.type !== NODE_TYPES.IDENTIFIER) {
            return;
        }

        // This applies to helpers and template references search
        const nameToSearch = nodeAtPosition.name;
        const indexArray =
            this.indexer.blazeIndexer.htmlUsageMap[nameToSearch] ||
            this.indexer.blazeIndexer.getTemplateInfo(nameToSearch);
        if (!Array.isArray(indexArray)) {
            console.warn(`Didn't find anything for ${nameToSearch}`);
            return;
        }

        return indexArray.map(({ node, uri }) => {
            const { start, end } = node.loc;

            return Location.create(
                uri.path,
                Range.create(
                    start.line - 1,
                    start.column,
                    end.line - 1,
                    end.column
                )
            );
        });
    }
}

module.exports = {
    ReferencesProvider,
};
