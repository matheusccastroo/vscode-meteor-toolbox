const createPositionObject = (position) => ({
    line: position.line + 1,
    column: position.character,
});

class AstWalker {
    constructor(textContent, parserFn) {
        this.shouldStop = false;

        if (textContent && parserFn) {
            this.ast = parserFn(textContent);
        }
    }

    getSymbolAtPosition(_position) {
        const position = createPositionObject(_position);

        let symbol;
        this.walk(this.ast, (node) => {
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

    walk(node, callback) {
        if (this.shouldStop) return;

        if (this.isNode(node)) callback(node);

        for (const k in node) {
            if (!Object.hasOwnProperty.call(node, k)) continue;

            const v = node[k];
            if (this.isNode(v)) {
                this.walk(v, callback);
            }

            if (Array.isArray(v)) {
                v.forEach((n) => {
                    if (!this.isNode(n)) return;

                    this.walk(n, callback);
                });
            }
        }
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
        return node && node.type === NODE_TYPES.PARTIAL_STATEMENT;
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
};

module.exports = {
    createPositionObject,
    AstWalker,
    NODE_TYPES,
};
