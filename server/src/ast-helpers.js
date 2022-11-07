const createPositionObject = (position) => ({
    line: position.line + 1,
    column: position.character,
});

class AstWalker {
    constructor(textContent, parserFn, options) {
        this.shouldStop = false;

        if (textContent && parserFn) {
            this.ast = parserFn(textContent, options);
        }
    }

    getSymbolAtPosition(_position) {
        const position = createPositionObject(_position);

        let symbol;
        this.walkUntil((node) => {
            if (node.loc && this.isSymbolInPositionRange(position, node.loc)) {
                symbol = node;
                this.stopWalking();
            }
        });

        return symbol;
    }

    isSymbolInPositionRange({ line, column }, { start, end }) {
        const containsInLine = line === start.line && line === end.line;
        const containsInColumn = column >= start.column && column <= end.column;
        return containsInLine && containsInColumn;
    }

    _walk(node, callback) {
        if (this.shouldStop) return;

        if (this.isNode(node)) callback(node);

        for (const k in node) {
            if (!Object.hasOwnProperty.call(node, k)) continue;

            const v = node[k];
            if (this.isNode(v)) {
                this._walk(v, callback);
            }

            if (Array.isArray(v)) {
                v.forEach((n) => {
                    if (!this.isNode(n)) return;

                    this._walk(n, callback);
                });
            }
        }
    }

    walkUntil(callback) {
        if (this.shouldStop) this.shouldStop = false;

        this._walk(this.ast, callback);
    }

    stopWalking() {
        this.shouldStop = true;
    }

    isNode(node) {
        return (
            node && typeof node === "object" && typeof node.type === "string"
        );
    }

    // Trying to use a template
    isPartialStatement(node) {
        return node && node.type === NODE_TYPES.PARTIAL_STATEMENT;
    }

    // Trying to use a helper/property from the template
    isMustacheStatement(node) {
        return node && node.type === NODE_TYPES.MUSTACHE_STATEMENT;
    }

    // Block helpers
    isBlockStatement(node) {
        return node && node.type === NODE_TYPES.BLOCK_STATEMENT;
    }

    // Parameters passed to helpers/templates
    isPathExpression(node) {
        return node && node.type === NODE_TYPES.PATH_EXPRESSION;
    }
}

const NODE_TYPES = {
    // {{> Template}}
    PARTIAL_STATEMENT: "PartialStatement",
    // {{variable}}
    MUSTACHE_STATEMENT: "MustacheStatement",
    // {{#each a}}{{/each}}
    BLOCK_STATEMENT: "BlockStatement",
    PATH_EXPRESSION: "PathExpression",
    CONTENT_STATEMENT: "ContentStatement",
    IDENTIFIER: "Identifier",
    MEMBER_EXPRESSION: "MemberExpression",
    EXPRESSION_STATEMENT: "ExpressionStatement",
    OBJECT_EXPRESSION: "ObjectExpression",
    PROPERTY: "Property",
    CALL_EXPRESSION: "CallExpression",
};

const NODE_NAMES = {
    TEMPLATE: "Template",
};

const DEFAULT_ACORN_OPTIONS = {
    allowImportExportEverywhere: true,
    ecmaVersion: 7,
    sourceType: "module",
    allowHashBang: true,
    locations: true,
};

module.exports = {
    createPositionObject,
    AstWalker,
    NODE_TYPES,
    DEFAULT_ACORN_OPTIONS,
    NODE_NAMES,
};
