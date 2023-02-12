const { ServerBase } = require("./helpers");

class ReferencesProvider extends ServerBase {
    constructor(serverInstance, documentsInstance, rootUri, indexer) {
        super(serverInstance, documentsInstance, rootUri, indexer);
    }

    async onReferenceRequest({ position, textDocument: { uri } }) {
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

        const { NODE_TYPES } = require("./ast-helpers");
        const { Location, Range } = require("vscode-languageserver");

        if (
            ![NODE_TYPES.LITERAL, NODE_TYPES.IDENTIFIER].includes(
                nodeAtPosition.type
            )
        ) {
            return;
        }

        // Find references for helpers, templateNames, and methods/publications.
        const nodeKey = nodeAtPosition.value || nodeAtPosition.name;
        const projectUri = await this.findRootFromUri(uri);
        const usageInfoArray =
            projectUri &&
            (this.indexer.methodsAndPublicationsIndexer.getUsageInfo(
                nodeKey,
                projectUri
            ) ||
                this.indexer.blazeIndexer.htmlUsageMap[
                    `${projectUri.fsPath}${nodeKey}`
                ] ||
                this.indexer.blazeIndexer.getTemplateInfo(nodeKey, projectUri));

        if (!Array.isArray(usageInfoArray) || !usageInfoArray.length) {
            console.warn(`No references found for ${nodeKey}`);
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
}

module.exports = {
    ReferencesProvider,
};
