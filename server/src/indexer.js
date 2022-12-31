const { ServerBase } = require("./helpers");
const { StringLiteralIndexer } = require("./string-literals-indexer");
const { BlazeIndexer } = require("./blaze-indexer");

class Indexer extends ServerBase {
    constructor({ rootUri, serverInstance, documentsInstance }) {
        if (!rootUri) {
            throw new Error("Expected rootUri");
        }

        super(serverInstance, documentsInstance, rootUri);

        this.loaded = false;
        this.sources = {};
        this.ignoreDirs = [];

        this.blazeIndexer = new BlazeIndexer();
        this.stringLiteralsIndexer = new StringLiteralIndexer();
    }

    async findUris(patterns) {
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
                    cwd: this.rootUri.fsPath,
                    ignore: [
                        "tests/**",
                        "**/**.tests.js",
                        "node_modules/**",
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

    indexHtmlFile({ uri, astWalker }) {
        if (!astWalker || !uri) {
            throw new Error(
                `Expected to receive uri and astWalker, but got: ${uri} and ${astWalker}`
            );
        }

        astWalker.walkUntil((node) => {
            this.blazeIndexer.indexHelpersUsageAndTemplateDefinitions({
                uri,
                node,
            });
        });
    }

    indexJsFile({ astWalker }) {
        if (!astWalker) {
            throw new Error("Missing ast-walker.");
        }

        astWalker.walkUntil((node) => {
            this.stringLiteralsIndexer.indexStringLiterals(node);
            this.blazeIndexer.indexHelpers(node);
        });
    }

    async loadSources(globs = ["**/**{.js,.ts,.html}"]) {
        const uris = await this.findUris(globs);

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
                        isFileHtml && SpacebarsCompiler.parse(fileContent);

                    if (isFileHtml) {
                        this.indexHtmlFile({ uri, astWalker });
                    } else {
                        this.indexJsFile({ astWalker });
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

        this.sources = results.filter(Boolean).reduce(
            (acc, fileInfo) => ({
                ...acc,
                [fileInfo.uri.fsPath]: fileInfo,
            }),
            {}
        );
        this.loaded = true;

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

    async onDidChangeConfiguration({
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

        await this.reindex();
    }

    async reindex() {
        console.info(`* Indexing project: ${this.rootUri}`);
        const { hasErrors, errors } = await this.loadSources();
        if (!hasErrors) {
            console.info("* Indexing completed.");
            return;
        }

        this.serverInstance.sendNotification(
            "errors/parsing",
            errors.map(({ uri }) => uri.fsPath).join(", \n")
        );
    }
}

module.exports = { Indexer };
