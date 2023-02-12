/**
 * Indexer focused on Blaze elements: helpers and template definitions.
 * For the future, we should support events too.
 */
class BlazeIndexer {
    constructor() {
        this.templateIndexMap = {};
        this.htmlUsageMap = {};
    }

    addHelpersToMap({ templateName, helperName, value, uri, projectUri }) {
        const projectPath = projectUri.fsPath;

        this.templateIndexMap[projectPath][templateName] =
            this.templateIndexMap[projectPath][templateName] || {};

        // Set JS uri too - we need to do that to be able to infer the template from a given helper
        // and file uri. It's used in getHelperFromTemplate() from this class.
        this.templateIndexMap[projectPath][templateName].jsUri =
            this.templateIndexMap[projectPath][templateName].jsUri || uri;

        this.templateIndexMap[projectPath][templateName]["helpers"] =
            this.templateIndexMap[projectPath][templateName]["helpers"] || {};

        this.templateIndexMap[projectPath][templateName]["helpers"][
            helperName
        ] = value;
    }

    addUsage({ node, uri, key, projectUri }) {
        if (!node || !uri || !key) {
            throw new Error(
                `Expected to receive node, uri and key, but got: ${node}, ${uri} and ${key}.`
            );
        }

        const {
            loc: {
                start: { line: startLine, column: startColumn },
                end: { line: endLine, column: endColumn },
            },
        } = node;
        const mapKey = `${projectUri.fsPath}${key}`;
        const entryKey = `${uri.fsPath}${startLine}${startColumn}${endLine}${endColumn}`;

        if (!Array.isArray(this.htmlUsageMap[mapKey])) {
            this.htmlUsageMap[mapKey] = [{ node, uri, entryKey }];
            return;
        }

        // Entry already exists, no need to add again.
        if (
            this.htmlUsageMap[mapKey].some(
                ({ entryKey: existingEntryKey }) =>
                    existingEntryKey === entryKey
            )
        ) {
            return;
        }

        return this.htmlUsageMap[mapKey].push({ node, uri, entryKey });
    }

    indexHelpers({ node, uri, projectUri }) {
        const { NODE_TYPES } = require("./ast-helpers");

        if (!node || node.type !== NODE_TYPES.CALL_EXPRESSION) {
            return;
        }

        const { TEMPLATE_CALLERS } = require("./constants");

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

            for (const prop of properties) {
                if (prop.type !== NODE_TYPES.PROPERTY) return;

                const { key, loc } = prop;
                this.addHelpersToMap({
                    templateName,
                    helperName: key.name,
                    value: loc,
                    uri,
                    projectUri,
                });
            }
        }
    }

    indexHelpersUsageAndTemplates({ uri, node, projectUri }) {
        if (!node || !uri) return;

        const { NODE_TYPES } = require("./ast-helpers");

        const { type, params, original, path, name } = node;
        if (type === NODE_TYPES.MUSTACHE_STATEMENT) {
            return this.addUsage({
                node: path,
                uri,
                key: path.head,
                projectUri,
            });
        }

        // Index template tags usage {{> templateName}}
        if (type === NODE_TYPES.PARTIAL_STATEMENT && name) {
            return this.addUsage({
                node: name,
                uri,
                key: name.original,
                projectUri,
            });
        }

        if (
            type === NODE_TYPES.BLOCK_STATEMENT &&
            Array.isArray(params) &&
            !!params.length
        ) {
            const firstParam = params[0];
            return this.addUsage({
                node: firstParam,
                uri,
                key: firstParam.original,
                projectUri,
            });
        }

        // Index <template name="templateName"> tags.
        if (
            type !== NODE_TYPES.CONTENT_STATEMENT ||
            typeof original !== "string"
        ) {
            return;
        }

        const regex = /template name=[\"\'](.*)[\"\']/g;
        const matches = regex.exec(original);

        if (!matches || !matches.length) return;

        this.templateIndexMap[projectUri.fsPath] =
            this.templateIndexMap[projectUri.fsPath] || {};
        this.templateIndexMap[projectUri.fsPath][matches[1]] = { node, uri };
    }

    getHelperFromTemplate({ templateName, helper, templateUri, projectUri }) {
        const _name =
            (typeof helper === "string" && helper) ||
            helper.parts?.[0] ||
            helper.path?.parts?.[0] ||
            helper.path?.original ||
            helper.original;

        if (!_name) {
            throw new Error(
                `Expected to receive helperName, but got ${helper}`
            );
        }

        const projectPath = projectUri.fsPath;
        let indexMap = this.templateIndexMap[projectPath][templateName];
        if (!indexMap && !!templateUri) {
            const fromTemplate = Object.keys(
                this.templateIndexMap[projectPath]
            ).find((k) => {
                if (
                    !Object.hasOwnProperty.call(
                        this.templateIndexMap[projectPath],
                        k
                    )
                ) {
                    return;
                }

                const jsUri = this.templateIndexMap[projectPath][k].jsUri;

                return jsUri && jsUri.path === templateUri.path;
            });

            indexMap =
                !!fromTemplate &&
                this.templateIndexMap[projectPath][fromTemplate];
        }

        if (!indexMap || !Object.keys(indexMap.helpers).length) return;

        return indexMap.helpers[_name];
    }

    getTemplateInfo(templateName, projectUri) {
        const _name =
            (typeof templateName === "string" && templateName) ||
            templateName.parts?.[0] ||
            templateName.name?.original ||
            templateName.object?.property?.name ||
            templateName.name;

        if (!_name) {
            throw new Error(
                `Expected to received templateName, but got: ${_name}`
            );
        }

        return this.templateIndexMap[projectUri.fsPath][_name] || {};
    }

    reset() {
        this.templateIndexMap = {};
        this.htmlUsageMap = {};
    }
}

module.exports = { BlazeIndexer };
