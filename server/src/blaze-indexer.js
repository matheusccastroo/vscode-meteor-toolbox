/**
 * Indexer focused on Blaze elements: helpers and template definitions.
 * For the future, we should support events too.
 */
class BlazeIndexer {
    constructor() {
        this.templateIndexMap = {};
        this.htmlUsageMap = {};
    }

    addHelpersToMap({ templateName, helperName, value }) {
        this.templateIndexMap[templateName] =
            this.templateIndexMap[templateName] || {};

        this.templateIndexMap[templateName]["helpers"] =
            this.templateIndexMap[templateName]["helpers"] || {};

        this.templateIndexMap[templateName]["helpers"][helperName] = value;
    }

    addUsage({ node, uri, key }) {
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
        const entryKey = `${uri.fsPath}${startLine}${startColumn}${endLine}${endColumn}`;

        if (!Array.isArray(this.htmlUsageMap[key])) {
            this.htmlUsageMap[key] = [{ node, uri, entryKey }];
            return;
        }

        // Entry already exists, no need to add again.
        if (
            this.htmlUsageMap[key].some(
                ({ entryKey: existingEntryKey }) =>
                    existingEntryKey === entryKey
            )
        ) {
            return;
        }

        return this.htmlUsageMap[key].push({ node, uri, entryKey });
    }

    indexHelpers(node) {
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
                });
            }
        }
    }

    indexHelpersUsageAndTemplates({ uri, node }) {
        if (!node || !uri) return;

        const { NODE_TYPES } = require("./ast-helpers");

        const { type, params, original, path, name } = node;
        if (type === NODE_TYPES.MUSTACHE_STATEMENT) {
            return this.addUsage({
                node,
                uri,
                key: path.head,
            });
        }

        // Index template tags usage {{> templateName}}
        if (type === NODE_TYPES.PARTIAL_STATEMENT && name) {
            return this.addUsage({ node, uri, key: name.original });
        }

        if (
            type === NODE_TYPES.BLOCK_STATEMENT &&
            Array.isArray(params) &&
            !!params.length
        ) {
            const firstParam = params[0];
            return this.addUsage({ node, uri, key: firstParam.original });
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

        this.templateIndexMap[matches[1]] = { node, uri };
    }

    getHelperFromTemplateName(templateName, helperName) {
        const _name =
            (typeof helperName === "string" && helperName) ||
            helperName.parts?.[0] ||
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
            templateName.parts?.[0] ||
            templateName.name?.original ||
            templateName.object?.property?.name ||
            templateName.name;

        if (!_name) {
            throw new Error(
                `Expected to received templateName, but got: ${_name}`
            );
        }

        return this.templateIndexMap[_name] || {};
    }

    reset() {
        this.templateIndexMap = {};
        this.htmlUsageMap = {};
    }
}

module.exports = { BlazeIndexer };
