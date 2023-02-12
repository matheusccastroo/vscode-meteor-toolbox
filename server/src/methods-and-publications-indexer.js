/**
 * Indexer focused on indexing methods and publications from the user code.
 *
 * Methods can be declared in two ways (if it uses the ValidatedMethod package):
 *  1 - Meteor.methods({ "method1": () => {...}, "method2"() {...} });
 *  2 - new ValidatedMethod({ name: "method1", run: () => {...} });
 *
 * Publications can also be declared in two ways (if it uses the PublishComposite package):
 *  1 - Meteor.publish("publication1", () => {...});
 *  2 - publishComposite("publication1", () => {...});
 */
class MethodsAndPublicationsIndexer {
    constructor() {
        // Store definitions
        this.methodsMap = {};
        this.publicationsMap = {};

        // Store usages
        this.usageMap = {};
    }

    addUsage({ node, uri, projectUri }) {
        if (!node || !uri) {
            throw new Error(
                `Expected to receive node and uri, but got: ${node} and ${uri}`
            );
        }

        const {
            value,
            loc: {
                start: { line: startLine, column: startColumn },
                end: { line: endLine, column: endColumn },
            },
        } = node;
        const usageMapKey = `${projectUri.fsPath}${value}`;
        const entryKey = `${projectUri.fsPath}${uri.fsPath}${startLine}${startColumn}${endLine}${endColumn}`;
        this.usageMap[usageMapKey] = this.usageMap[usageMapKey] || [];

        // If entry key is already on the values, don't add it again.
        if (
            this.usageMap[usageMapKey].some(
                ({ entryKey: existingEntryKey }) =>
                    existingEntryKey === entryKey
            )
        ) {
            return;
        }

        this.usageMap[usageMapKey].push({ node, uri, entryKey });
    }

    addDefinitionToMap({ node, isMethod = false, uri, projectUri }) {
        const { NODE_TYPES } = require("./ast-helpers");

        if (
            !node ||
            ![NODE_TYPES.LITERAL, NODE_TYPES.IDENTIFIER].includes(node.type)
        ) {
            return;
        }

        const toAdd = isMethod ? this.methodsMap : this.publicationsMap;
        toAdd[`${projectUri.fsPath}${node.value || node.name}`] = { node, uri };

        return true;
    }

    isPublication({
        type,
        callee: {
            type: calleeType,
            name: calleeName,
            property: calleeProperty,
            object: calleeObject,
        },
    }) {
        const { NODE_TYPES } = require("./ast-helpers");

        if (type !== NODE_TYPES.CALL_EXPRESSION) {
            return;
        }

        const {
            METEOR_SUPPORTED_PACKAGES_IDENTIFIER,
            METEOR_IDENTIFIERS,
        } = require("./constants");

        // It's a publishComposite call
        if (
            calleeType === NODE_TYPES.IDENTIFIER &&
            calleeName ===
                METEOR_SUPPORTED_PACKAGES_IDENTIFIER.PUBLISH_COMPOSITE
        ) {
            return true;
        }

        if (!calleeProperty || !calleeObject) {
            return;
        }

        const { type: calleeObjectType, name: calleeObjectName } = calleeObject;
        if (
            calleeObjectType !== NODE_TYPES.IDENTIFIER ||
            calleeObjectName !== METEOR_IDENTIFIERS.METEOR
        ) {
            return;
        }

        const { type: calleePropertyType, name: calleePropertyName } =
            calleeProperty;

        return (
            calleePropertyType === NODE_TYPES.IDENTIFIER &&
            calleePropertyName === METEOR_IDENTIFIERS.PUBLISH
        );
    }

    isMethod({
        type,
        callee: {
            type: calleeType,
            name: calleeName,
            property: calleeProperty,
            object: calleeObject,
        },
    }) {
        const { NODE_TYPES } = require("./ast-helpers");

        if (
            ![NODE_TYPES.NEW_EXPRESSION, NODE_TYPES.CALL_EXPRESSION].includes(
                type
            )
        ) {
            return;
        }

        const {
            METEOR_SUPPORTED_PACKAGES_IDENTIFIER,
            METEOR_IDENTIFIERS,
        } = require("./constants");

        // It's a ValidatedMethod?
        if (
            calleeType == NODE_TYPES.IDENTIFIER &&
            calleeName ===
                METEOR_SUPPORTED_PACKAGES_IDENTIFIER.VALIDATED_METHODS.NAME
        ) {
            return true;
        }

        if (!calleeProperty || !calleeObject) {
            return;
        }

        const { type: calleeObjectType, name: calleeObjectName } = calleeObject;
        if (
            calleeObjectType !== NODE_TYPES.IDENTIFIER ||
            calleeObjectName !== METEOR_IDENTIFIERS.METEOR
        ) {
            return;
        }

        const { type: calleePropertyType, name: calleePropertyName } =
            calleeProperty;

        return (
            calleePropertyType === NODE_TYPES.IDENTIFIER &&
            calleePropertyName === METEOR_IDENTIFIERS.METHODS
        );
    }

    indexUsage({ node, uri, previousNode = {}, projectUri }) {
        if (!node || !uri) {
            throw new Error(
                `Expected to receive node and uri, but got: ${node} and ${uri}`
            );
        }

        const { NODE_TYPES } = require("./ast-helpers");

        const { type, value } = node;
        const { type: previousType, name: previousName } = previousNode;

        const isMethodDeclaration =
            previousType && previousType === NODE_TYPES.PROPERTY;
        const isPublicationDeclaration =
            previousType &&
            previousType === NODE_TYPES.IDENTIFIER &&
            ["publish", "publishComposite"].includes(previousName);
        // If the type of the previous node is a property, then we don't want
        // to index this node, since it's the declaration of the method.
        if (
            type !== NODE_TYPES.LITERAL ||
            isMethodDeclaration ||
            isPublicationDeclaration
        ) {
            return;
        }

        if (
            ![this.methodsMap, this.publicationsMap].some((map) =>
                Object.hasOwnProperty.call(map, `${projectUri.fsPath}${value}`)
            )
        ) {
            return;
        }

        this.addUsage({ node, uri, projectUri });
    }

    indexDefinitions({ uri, node, projectUri }) {
        if (!node || !uri) {
            throw new Error(
                `Expected to receive node and uri, but got: ${node} and ${uri}`
            );
        }

        const { NODE_TYPES } = require("./ast-helpers");

        if (
            !node ||
            ![NODE_TYPES.CALL_EXPRESSION, NODE_TYPES.NEW_EXPRESSION].includes(
                node.type
            )
        ) {
            return;
        }

        const isMethod = !!this.isMethod(node);
        const isPublication = !!this.isPublication(node);

        if (!isMethod && !isPublication) {
            return;
        }

        if (isMethod && isPublication) {
            throw new Error(
                "Node can't be a method and a publication at the same time. Is this intentional?"
            );
        }

        return this.handleStringLiterals({
            node,
            isMethod,
            uri,
            projectUri,
        });
    }

    handleStringLiterals({ node, isMethod, uri, projectUri }) {
        const nodeArguments = node.arguments;
        if (!Array.isArray(nodeArguments) || !nodeArguments.length) {
            return;
        }

        const { NODE_TYPES } = require("./ast-helpers");
        const { METEOR_SUPPORTED_PACKAGES_IDENTIFIER } = require("./constants");

        for (const arg of nodeArguments) {
            // If it's not for methods, and we already found the string literal,
            // then we have the publication name.
            if (
                !isMethod &&
                this.addDefinitionToMap({ node: arg, uri, projectUri })
            ) {
                break;
            }

            const { type, properties } = arg;
            // The wrapping node is always an object expression (i.e { name: "methodName", run: () => {} }
            // or { "methodName": () => {} })
            if (
                type !== NODE_TYPES.OBJECT_EXPRESSION ||
                !Array.isArray(properties)
            ) {
                continue;
            }

            for (const { type, key, value } of properties) {
                // Acorn doesn't distinct between ObjectMethod and ObjectProperty, as Babel does.
                if (
                    ![NODE_TYPES.PROPERTY, NODE_TYPES.IDENTIFIER].includes(type)
                ) {
                    continue;
                }

                const isValidatedMethod =
                    key?.name ===
                    METEOR_SUPPORTED_PACKAGES_IDENTIFIER.VALIDATED_METHODS.KEY;
                this.addDefinitionToMap({
                    node: isValidatedMethod ? value : key,
                    isMethod,
                    uri,
                    projectUri,
                });
            }
        }
    }

    getLiteralInfo(key, projectUri) {
        if (!key || typeof key !== "string") {
            throw new Error(`Expected to receive key, but got: ${key}`);
        }

        const targetKey = `${projectUri.fsPath}${key}`;
        return this.methodsMap[targetKey] || this.publicationsMap[targetKey];
    }

    getUsageInfo(key, projectUri) {
        if (!key || typeof key !== "string") {
            throw new Error(`Expected to receive key, but got: ${key}`);
        }

        return this.usageMap[`${projectUri.fsPath}${key}`];
    }

    reset() {
        this.methodsMap = {};
        this.publicationsMap = {};
        this.usageMap = {};
    }
}

module.exports = { MethodsAndPublicationsIndexer };
