const findNode = (node, position) => {
    if (!(node.getStart() <= position && position <= node.getEnd())) {
        return undefined;
    }

    let result = node;
    node.forEachChild(
        (node) => {
            const c = findNode(node, position);
            if (c) {
                result = c;
            }
        },
        (arr) => {
            for (const item of arr) {
                const c = findNode(item, position);
                if (c) {
                    result = c;
                }
            }
        }
    );

    return result;
};

module.exports = { findNode };
