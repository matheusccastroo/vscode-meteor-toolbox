const { ServerBase } = require("./helpers");

class Indexer extends ServerBase {
    constructor({ rootUri, serverInstance, documentsInstance }) {
        if (!rootUri) {
            throw new Error("Expected rootUri");
        }

        super(serverInstance, documentsInstance, rootUri);

        this.loaded = false;
        this.sources = {};
        this.templateIndexMap = {};
        this.htmlUsageMap = {};
        this.ignoreDirs = [];
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

    // Index helper usage and template definitions on HTML.
    async indexHtmlFile({ uri, astWalker }) {
        const { NODE_TYPES } = require("./ast-helpers");

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
                    ...(this.htmlUsageMap[firstParam.original] || []),
                    { node, uri },
                ];
            }

            // Index <template name="templateName"> tags.
            if (
                type === NODE_TYPES.CONTENT_STATEMENT &&
                typeof original === "string"
            ) {
                const regex = /template name=[\"\'](.*)[\"\']/g;
                const matches = regex.exec(original);

                if (!matches || !matches.length) return;

                const existingValues = this.templateIndexMap[matches[1]];
                this.templateIndexMap[matches[1]] = {
                    ...existingValues,
                    node,
                    uri,
                };
            }
        });
    }

    // Index helpers definitions on JS
    async indexJsFile({ astWalker }) {
        const { NODE_TYPES } = require("./ast-helpers");
        const { TEMPLATE_CALLERS } = require("./helpers");

        const setHelperOnIndex = (templateName, helperName, value) => {
            this.templateIndexMap[templateName] =
                this.templateIndexMap[templateName] || {};

            this.templateIndexMap[templateName]["helpers"] =
                this.templateIndexMap[templateName]["helpers"] || {};

            this.templateIndexMap[templateName]["helpers"][helperName] = value;
        };

        astWalker.walkUntil((node) => {
            if (!node || node.type !== NODE_TYPES.CALL_EXPRESSION) {
                return;
            }

            const callee = node.callee;
            if (
                !callee ||
                callee.type !== NODE_TYPES.MEMBER_EXPRESSION ||
                callee.property.name !== TEMPLATE_CALLERS.HELPERS
            )
                return;

            const templateNameProperty = callee.object.property;
            if (templateNameProperty.type !== NODE_TYPES.IDENTIFIER) return;

            const templateName = templateNameProperty.name;

            const { arguments: nodeArguments } = node;
            if (!Array.isArray(nodeArguments) || !nodeArguments.length) return;

            for (const arg of nodeArguments) {
                const { properties } = arg;
                if (!properties || !properties.length) return;

                properties.forEach((prop) => {
                    if (prop.type !== NODE_TYPES.PROPERTY) return;

                    const { key, loc } = prop;
                    setHelperOnIndex(templateName, key.name, loc);
                });
            }
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

    getHelperFromTemplateName(templateName, helperName) {
        const _name =
            (typeof helperName === "string" && helperName) ||
            helperName.path?.parts?.[0] ||
            helperName.path?.original ||
            helperName.original;

        if (!_name) {
            throw new Error(
                `Expected to receive helperName, but got ${helperName}`
            );
        }

        const indexMap = this.templateIndexMap[templateName];
        if (!indexMap || !Object.keys(indexMap.helpers).length) return;

        return indexMap.helpers[_name];
    }

    getTemplateInfo(templateName) {
        const _name =
            (typeof templateName === "string" && templateName) ||
            templateName.name?.original ||
            templateName.object?.property?.name;

        if (!_name) {
            throw new Error(
                `Expected to received templateName, but got: ${_name}`
            );
        }

        return this.templateIndexMap[_name];
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
