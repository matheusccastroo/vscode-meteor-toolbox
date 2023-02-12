const { ServerBase } = require("./helpers");
const {
    MethodsAndPublicationsIndexer,
} = require("./methods-and-publications-indexer");
const { BlazeIndexer } = require("./blaze-indexer");

class Indexer extends ServerBase {
    constructor({ workspaceFolders, serverInstance, documentsInstance }) {
        if (!workspaceFolders) {
            throw new Error(
                `Expected at least workspaceFolders, but got: ${workspaceFolders}`
            );
        }

        super(serverInstance, documentsInstance, workspaceFolders);

        this.loaded = false;
        this.sources = {};
        this.ignoreDirs = [];

        this.blazeIndexer = new BlazeIndexer();
        this.methodsAndPublicationsIndexer =
            new MethodsAndPublicationsIndexer();
    }

    async findUris(projectUri, patterns) {
        const glob = require("glob");
        const { promisify } = require("util");

        const directoriesToBeIgnored = this.ignoreDirs.map(({ fsPath }) => {
            const finishesWithSlash = fsPath[fsPath.length - 1] === "/";
            const startsWithSlash = fsPath[0] === "/";

            let finalGlob = `${fsPath}${finishesWithSlash ? "" : "/"}**`;
            // If starts with "/", we remove it so that the Glob works correctly for the cwd specified.
            if (startsWithSlash) {
                finalGlob = finalGlob.slice(1);
            }

            return finalGlob;
        });

        const globPromise = promisify(glob);
        const uriArrays = await Promise.all(
            patterns.map((_p) =>
                globPromise(_p, {
                    cwd: projectUri.fsPath,
                    ignore: [
                        "**/tests/**",
                        "**/**.tests.js",
                        "**/node_modules/**",
                        ...directoriesToBeIgnored,
                    ],
                    absolute: true,
                })
            )
        );

        // Flatten them all
        const uris = uriArrays.flatMap((paths) => paths);
        return [...new Set(uris).values()].sort().map(this.parseUri);
    }

    indexHtmlFile({ uri, astWalker, projectUri }) {
        if (!astWalker || !uri) {
            throw new Error(
                `Expected to receive uri and astWalker, but got: ${uri} and ${astWalker}`
            );
        }

        astWalker.walkUntil((node) => {
            this.blazeIndexer.indexHelpersUsageAndTemplates({
                uri,
                node,
                projectUri,
            });
        });
    }

    indexJsFile({ uri, astWalker, shouldIndexBlaze = true, projectUri }) {
        if (!astWalker || !uri) {
            throw new Error(
                `Expected to receive uri and astWalker, but got: ${uri} and ${astWalker}`
            );
        }

        let previousNode;
        astWalker.walkUntil((node) => {
            this.methodsAndPublicationsIndexer.indexDefinitions({
                uri,
                node,
                projectUri,
            });
            this.methodsAndPublicationsIndexer.indexUsage({
                uri,
                node,
                previousNode,
                projectUri,
            });

            shouldIndexBlaze &&
                this.blazeIndexer.indexHelpers({ node, uri, projectUri });
            previousNode = node;
        });
    }

    async loadSources({
        globs = ["**/**{.js,.ts,.html}"],
        shouldIndexBlaze = true,
        projectUri,
    }) {
        if (!projectUri) {
            throw new Error(`ProjectUri is required to loadSources.`);
        }

        const uris = await this.findUris(projectUri, globs);

        const { AstWalker, DEFAULT_ACORN_OPTIONS } = require("./ast-helpers");
        const { SpacebarsCompiler } = require("@blastjs/spacebars-compiler");

        const { parse: acornParser } = require("acorn");
        const { parse: handlebarsParser } = require("@handlebars/parser");

        const parsingErrors = [];
        const results = await Promise.all(
            uris.map(async (uri) => {
                try {
                    const extension = this.getFileExtension(uri);
                    const isFileHtml = this.isFileSpacebarsHTML(uri);

                    const fileContent = await this.getFileContentPromise(uri);

                    const astWalker = new AstWalker(
                        fileContent,
                        isFileHtml ? handlebarsParser : acornParser,
                        isFileHtml ? {} : DEFAULT_ACORN_OPTIONS
                    );

                    // Also index the htmlJs representation.
                    const htmlJs =
                        shouldIndexBlaze &&
                        isFileHtml &&
                        SpacebarsCompiler.parse(fileContent);

                    if (isFileHtml) {
                        shouldIndexBlaze &&
                            this.indexHtmlFile({ uri, astWalker, projectUri });
                    } else {
                        this.indexJsFile({
                            uri,
                            astWalker,
                            shouldIndexBlaze,
                            projectUri,
                        });
                    }

                    return {
                        extension,
                        astWalker,
                        uri,
                        htmlJs,
                    };
                } catch (e) {
                    console.error(`Error parsing ${uri}. ${e}`);
                    parsingErrors.push({ uri, error: e });
                    return;
                }
            })
        );

        this.sources = Object.assign(
            this.sources || {},
            results.filter(Boolean).reduce(
                (acc, fileInfo) => ({
                    ...acc,
                    [fileInfo.uri.fsPath]: fileInfo,
                }),
                {}
            )
        );

        return {
            hasErrors: Array.isArray(parsingErrors) && !!parsingErrors.length,
            errors: parsingErrors,
        };
    }

    getSources() {
        if (!this.loaded) {
            throw new Error("Indexer was not loaded");
        }

        return this.sources;
    }

    getFileInfo(uri) {
        return this.getSources()[this.parseUri(uri).fsPath];
    }

    getSourcesOfType(fileExtension) {
        if (![".html", ".js", ".ts"].includes(fileExtension)) {
            throw new Error(
                `Invalid extension requested. Received: ${fileExtension}`
            );
        }

        return Object.values(this.getSources()).filter(
            ({ extension }) => extension === fileExtension
        );
    }

    onDidChangeConfiguration({
        settings: {
            conf: {
                settingsEditor: {
                    meteorToolbox: { ignoreDirsOnIndexing } = {},
                } = {},
            } = {},
        } = {},
    }) {
        if (!ignoreDirsOnIndexing) {
            console.warn("No directories set to be ignored, nothing to do...");
            this.ignoreDirs = [];
        } else {
            const parsedDirs = ignoreDirsOnIndexing.split(",");
            if (!parsedDirs.length) {
                throw new Error(
                    "Error parsing directories to ignore on indexing."
                );
            }

            this.ignoreDirs = parsedDirs.map(this.parseUri);
        }

        return this.reindex();
    }

    async reindex() {
        const meteorProjects = await this.getMeteorProjects();

        const indexResults = (
            await Promise.all(
                Object.keys(meteorProjects).map((projectKey) => {
                    const meteorProjectsInsideWorkspace =
                        meteorProjects[projectKey];
                    if (!meteorProjectsInsideWorkspace.length) {
                        return null;
                    }

                    return Promise.all(
                        meteorProjectsInsideWorkspace.map(
                            async (projectUri) => {
                                console.info(
                                    `* Indexing project: ${projectUri.fsPath}`
                                );
                                [
                                    this.blazeIndexer,
                                    this.methodsAndPublicationsIndexer,
                                ].forEach((i) => i?.reset?.());

                                return this.loadSources({
                                    shouldIndexBlaze:
                                        await this.isUsingMeteorPackage(
                                            projectUri,
                                            "blaze-html-templates"
                                        ),
                                    projectUri,
                                });
                            }
                        )
                    );
                })
            )
        ).flatMap((results) => results);

        this.loaded = true;

        const { hasErrors, errors } = indexResults.reduce(
            (acc, { hasErrors, errors }) => {
                if (!acc.hasErrors) {
                    acc.hasErrors = hasErrors;
                }

                if (acc.errors) {
                    acc.errors.push(...errors);
                } else {
                    acc.errors = errors;
                }

                return acc;
            },
            {}
        );

        if (!hasErrors) {
            console.info("* Indexing completed.");
            return;
        }

        console.info("* Errors found when indexing");
        this.serverInstance.sendNotification(
            "errors/parsing",
            errors.map(({ uri }) => uri.fsPath).join(", \n")
        );
    }
}

module.exports = { Indexer };
