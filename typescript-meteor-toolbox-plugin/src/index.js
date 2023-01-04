const formatLog = (msg) => `[typescript-meteor-toolbox-plugin]: ${msg}`;

const create = (info) => {
    info.project.projectService.logger.info(
        formatLog("Successfully started typescript-meteor-toolbox-plugin")
    );

    // Set up decorator object
    const proxy = Object.create(null);
    for (const k of Object.keys(info.languageService)) {
        proxy[k] = (...args) =>
            info.languageService[k].apply(info.languageService, args);
    }

    // Remove own definition from references list.
    proxy.findReferences = (fileName, position) => {
        info.project.projectService.logger.info(
            formatLog("Received findReferences request")
        );

        const originalResult = info.languageService.findReferences(
            fileName,
            position
        );

        if (!Array.isArray(originalResult) || !originalResult.length)
            return originalResult;

        return originalResult.map(({ definition, references }) => {
            const {
                fileName: definitionFileName,
                textSpan: definitionTextSpan,
                contextSpan: definitionContextSpan,
            } = definition;
            const filteredReferences = references.filter(
                ({ textSpan, fileName, contextSpan }) =>
                    !(
                        fileName === definitionFileName &&
                        contextSpan.start === definitionContextSpan.start &&
                        contextSpan.length === definitionContextSpan.length &&
                        textSpan.start === definitionTextSpan.start &&
                        textSpan.length === definitionTextSpan.length
                    )
            );

            const filterFiltered =
                filteredReferences.length === references.length;

            if (filterFiltered) {
                info.project.projectService.logger.info(
                    formatLog(
                        `Applied filter for entry: ${JSON.stringify(
                            { definition, references },
                            undefined,
                            2
                        )}`
                    )
                );
            }

            return {
                definition,
                references: filterFiltered ? references : filteredReferences,
            };
        });
    };

    // Fix Template.templateName references request.
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
        info.project.projectService.logger.info(
            formatLog("Received getCompletionsAtPosition request")
        );

        const originalResult = info.languageService.getCompletionsAtPosition(
            fileName,
            position,
            options
        );

        const sourceFile = info.languageService
            .getProgram()
            .getSourceFile(fileName);

        if (!sourceFile) {
            return originalResult;
        }

        const { findNode } = require("./utils");
        const node = findNode(sourceFile, position);
        if (!node) {
            return originalResult;
        }

        const escapedText = node.expression?.escapedText;
        if (escapedText && escapedText.toLowerCase() === "template") {
            originalResult.entries = [];
        }

        return originalResult;
    };

    // Fix template go to references conflict
    proxy.getDefinitionAndBoundSpan = (fileName, position) => {
        info.project.projectService.logger.info(
            formatLog("Received getDefinitionAndBoundSpan request")
        );

        const originalResult = info.languageService.getDefinitionAndBoundSpan(
            fileName,
            position
        );

        const { findNode } = require("./utils");
        const sourceFile = info.languageService
            .getProgram()
            .getSourceFile(fileName);

        if (!sourceFile) {
            return originalResult;
        }

        const node = findNode(sourceFile, position);
        if (!node || !node.parent || !node.parent.expression) {
            return originalResult;
        }

        const { expression } = node.parent;
        if (expression?.escapedText.toLowerCase() === "template") {
            originalResult.definitions = [];
        }

        return originalResult;
    };

    return proxy;
};

module.exports = () => ({ create });
