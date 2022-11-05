const fg = require("fast-glob")
const fs = require("fs/promises")
const { relative } = require("path")
const url = require("url")

class NodeFiles {
    constructor(rootUri) {
        this.rootUri = rootUri;
    }

    async exists(uri) {
        try {
            await fs.stat(new URL(uri));
            return true;
        } catch (e) {
            return false;
        }
    }

    readFile(uri) {
        const path = url.fileURLToPath(uri);
        return fs.readFile(path, "utf-8");
    }

    async findUris(glob) {
        const cwd = url.fileURLToPath(this.rootUri);
        const paths = await fg(glob, {
            cwd,
            caseSensitiveMatch: false,
            onlyFiles: true,
        });
        return paths.map((path) => url.pathToFileURL(path).href);
    }

    relativePath(uri) {
        return relative(new URL(this.rootUri).pathname, new URL(uri).pathname);
    }
}

module.exports = { NodeFiles }