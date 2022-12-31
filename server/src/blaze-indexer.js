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

    indexHelpersUsageAndTemplateDefinitions({ uri, node }) {
        if (!node || !uri) return;

        const { NODE_TYPES } = require("./ast-helpers");

        const { type, params, original, path } = node;
        if (type === NODE_TYPES.MUSTACHE_STATEMENT) {
            this.htmlUsageMap[path.head] = [
                ...(this.htmlUsageMap[path.head] || []),
                { node, uri },
            ];
        }

        if (
            type === NODE_TYPES.BLOCK_STATEMENT &&
            Array.isArray(params) &&
            !!params.length
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
}

module.exports = { BlazeIndexer };
