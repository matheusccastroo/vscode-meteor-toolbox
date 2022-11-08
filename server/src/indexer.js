const { ServerBase } = require("./helpers");

class Indexer extends ServerBase {
    constructor({ rootUri, serverInstance, documentsInstance }) {
        if (!rootUri) {
            throw new Error("Expected rootUri");
        }

        super(serverInstance, documentsInstance, rootUri);

        this.loaded = false;
        this.sources = {};
    }

    async findUris(patterns) {
        const glob = require("glob");
        const { promisify } = require("util");

        const globPromise = promisify(glob);
        const uriArrays = await Promise.all(
            patterns.map((_p) =>
                globPromise(_p, {
                    cwd: this.rootUri.fsPath,
                    ignore: ["tests/**", "**/**.tests.js", "node_modules/**"],
                    absolute: true,
                })
            )
        );

        // Flatten them all
        const uris = uriArrays.flatMap((paths) => paths);
        return [...new Set(uris).values()].sort().map(this.parseUri);
    }

    async loadSources(globs = ["**/**{.js,.ts,.html}"]) {
        const uris = await this.findUris(globs);

        const { AstWalker, DEFAULT_ACORN_OPTIONS } = require("./ast-helpers");
        const { SpacebarsCompiler } = require("@blastjs/spacebars-compiler");

        const { parse: acornParser } = require("acorn");
        const { parse: handlebarsParser } = require("@handlebars/parser");

        const results = await Promise.all(
            uris
                .map(async (uri) => {
                    try {
                        const extension = this.getFileExtension(uri);
                        const isFileHtml = this.isFileSpacebarsHTML(uri);

                        const fileContent = await this.getFileContentPromise(
                            uri
                        );
                        const astWalker = new AstWalker(
                            fileContent,
                            isFileHtml ? handlebarsParser : acornParser,
                            isFileHtml ? {} : DEFAULT_ACORN_OPTIONS
                        );

                        // Also index the htmlJs representation.
                        const htmlJs =
                            isFileHtml && SpacebarsCompiler.parse(fileContent);
                        const { NODE_TYPES } = require("./ast-helpers");

                        this.templateIndexMap = this.templateIndexMap || {};
                        this.htmlUsageMap = this.htmlUsageMap || {};
                        astWalker.walkUntil((node) => {
                            if (!node) return;

                            const { type, params, original, path } = node;
                            if (type === NODE_TYPES.MUSTACHE_STATEMENT) {
                                this.htmlUsageMap[path.head] = [
                                    ...(this.htmlUsageMap[path.head] || []),
                                    { node, uri },
                                ];
                            }

                            if (
                                type === NODE_TYPES.BLOCK_STATEMENT &&
                                params &&
                                params.length
                            ) {
                                const firstParam = params[0];
                                this.htmlUsageMap[firstParam.original] = [
                                    ...(this.htmlUsageMap[
                                        firstParam.original
                                    ] || []),
                                    { node, uri },
                                ];
                            }

                            if (
                                type === NODE_TYPES.CONTENT_STATEMENT &&
                                typeof original === "string"
                            ) {
                                const regex = /template name=[\"\'](.*)[\"\']/g;
                                const matches = regex.exec(original);

                                if (!matches || !matches.length) return;

                                this.templateIndexMap[matches[1]] = {
                                    node,
                                    uri,
                                };
                            }
                        });

                        return {
                            extension,
                            astWalker,
                            uri,
                            htmlJs,
                        };
                    } catch (e) {
                        console.error(`Error parsing file ${uri}`);
                        console.error(e);
                        return;
                    }
                })
                .filter(Boolean)
        );

        this.sources = results.reduce(
            (acc, fileInfo) => ({ ...acc, [fileInfo.uri.fsPath]: fileInfo }),
            {}
        );
        this.loaded = true;
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
}

module.exports = { Indexer };
