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

    return proxy;
};

module.exports = () => ({ create });
