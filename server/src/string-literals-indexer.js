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
class StringLiteralIndexer {
    constructor() {
        this.methodsMap = {};
        this.publicationsMap = {};
    }

    addStringLiteralToMap({ type, value, loc }, isMethod) {
        const { NODE_TYPES } = require("./ast-helpers");

        if (type !== NODE_TYPES.LITERAL || !value || !loc) {
            return;
        }

        const toAdd = isMethod ? this.methodsMap : this.publicationsMap;
        toAdd[value] = loc;

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

    indexStringLiterals(node) {
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
        });
    }

    handleStringLiterals({ node, isMethod }) {
        const nodeArguments = node.arguments;
        if (!Array.isArray(nodeArguments) || !nodeArguments.length) {
            return;
        }

        const { NODE_TYPES } = require("./ast-helpers");
        const { METEOR_SUPPORTED_PACKAGES_IDENTIFIER } = require("./constants");

        for (const arg of nodeArguments) {
            // If it's not for methods, and we already found the string literal,
            // then we have the publication name.
            if (!isMethod && this.addStringLiteralToMap(arg)) {
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
                if (type !== NODE_TYPES.PROPERTY) {
                    continue;
                }

                const isValidatedMethod =
                    key?.name ===
                    METEOR_SUPPORTED_PACKAGES_IDENTIFIER.VALIDATED_METHODS.KEY;
                this.addStringLiteralToMap(
                    isValidatedMethod ? value : key,
                    isMethod
                );
            }
        }
    }
}

module.exports = { StringLiteralIndexer };
