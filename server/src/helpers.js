class ServerBase {
    static SPACEBARS_FILES_EXTENSION = {
        HTML_TEMPLATE: ".html",
        JS_TEMPLATE: ".js",
    };

    constructor(serverInstance, documentsInstance, workspaceFolders, indexer) {
        this.serverInstance = serverInstance;
        this.documentsInstance = documentsInstance;
        this.workspaceFolders = workspaceFolders;
        this.indexer = indexer;
    }

    parseUri(uri) {
        if (!uri) {
            throw new Error("Missing URI parameter");
        }

        const { URI } = require("vscode-uri");

        return uri instanceof URI ? uri : URI.parse(uri);
    }

    getFileExtension(uri) {
        if (!uri) {
            throw new Error(`Wrong parameter URI. Received: ${uri}`);
        }

        const { Utils } = require("vscode-uri");

        return Utils.extname(this.parseUri(uri));
    }

    isFileSpacebarsHTML(uri) {
        return (
            this.getFileExtension(uri) ===
            ServerBase.SPACEBARS_FILES_EXTENSION.HTML_TEMPLATE
        );
    }

    isFileJS = (uri) => {
        return (
            this.getFileExtension(uri) ===
            ServerBase.SPACEBARS_FILES_EXTENSION.JS_TEMPLATE
        );
    };

    getFileContent(_uri, range) {
        if (!this.serverInstance) {
            throw new Error("Server instance is required to get file content");
        }

        if (!this.documentsInstance) {
            throw new Error(
                "Documents instance is required to get file content"
            );
        }

        const uri = this.parseUri(_uri);

        const fromDocumentInstance = this.documentsInstance.get(uri);
        if (!!fromDocumentInstance) {
            return fromDocumentInstance.getText(range);
        }

        return require("fs").readFileSync(uri.fsPath, { encoding: "utf-8" });
    }

    getFileContentPromise(_uri) {
        if (!_uri) {
            throw new Error("_uri is required");
        }

        // Parse to get the correct fsPath that works on all OS's.
        const uri = this.parseUri(_uri);

        return require("fs/promises").readFile(uri.fsPath, {
            encoding: "utf-8",
        });
    }

    async isUsingMeteorPackage(projectUri, packageName) {
        if (!packageName || typeof packageName !== "string") {
            throw new Error(
                `Expected to receive packageName string, but got: ${packageName}`
            );
        }

        const { Utils } = require("vscode-uri");
        const packageFilesUri = Utils.joinPath(
            projectUri,
            ".meteor",
            "packages"
        );

        try {
            const fileContent = await this.getFileContentPromise(
                packageFilesUri
            );

            return !!fileContent.match(new RegExp(`^${packageName}`, "gm"))
                ?.length;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    /**
     * This is basically duplicated from the client extension,
     * but for now this is OK. In the futuer we may want to have
     * a shared folder.
     */
    async fileExists(fileUri) {
        if (!fileUri) {
            return false;
        }

        // We can accept either URI or string.
        const _uri = this.parseUri(fileUri);

        let exists;
        try {
            exists = !!(await require("fs/promises").stat(_uri.fsPath));
        } catch (e) {
            exists = false;
        }

        return exists;
    }

    getMeteorProjects(workspaceFolder) {
        const { Utils } = require("vscode-uri");
        const { readdir } = require("fs/promises");

        return [
            ...(workspaceFolder ? [workspaceFolder] : this.workspaceFolders),
        ].reduce(async (acc, { uri: rootUri }) => {
            const currentAcc = await acc;
            const parsedUri = this.parseUri(rootUri);
            const key = parsedUri.fsPath;

            if (await this.isMeteorProject(rootUri)) {
                currentAcc[key] = [parsedUri];
                return currentAcc;
            }

            const foldersToCheck = (await readdir(key, { withFileTypes: true }))
                .filter((f) => !!f.isDirectory())
                .map((d) => d.name)
                .map((name) => Utils.joinPath(parsedUri, name));
            if (!foldersToCheck.length) {
                return currentAcc;
            }

            currentAcc[key] = (
                await Promise.all(
                    foldersToCheck.map(async (possibleProjectPath) =>
                        (await this.isMeteorProject(possibleProjectPath))
                            ? possibleProjectPath
                            : null
                    )
                )
            ).filter(Boolean);

            return currentAcc;
        }, Promise.resolve({}));
    }

    async isMeteorProject(possibleProjectUri) {
        if (!possibleProjectUri) {
            throw new Error(
                "Missing project path when checking if it's a meteor project"
            );
        }
        const _uri = this.parseUri(possibleProjectUri);
        const { Utils } = require("vscode-uri");

        return this.fileExists(Utils.joinPath(_uri, ".meteor"));
    }

    async findRootFromUri(uri) {
        const matchingWorkspaceFolder = this.workspaceFolders.find(
            ({ uri: workspaceUri }) => uri.includes(workspaceUri)
        );

        if (!matchingWorkspaceFolder) {
            return null;
        }

        const parsedWorkspacePath = this.parseUri(
            matchingWorkspaceFolder.uri
        ).path;
        const existingMeteorProjects = (
            await this.getMeteorProjects(matchingWorkspaceFolder)
        )?.[parsedWorkspacePath];
        if (!existingMeteorProjects?.length) {
            return null;
        }

        const parsedUriPath = this.parseUri(uri).path;
        return existingMeteorProjects.find((projectDir) =>
            parsedUriPath.includes(projectDir.fsPath)
        );
    }
}

module.exports = {
    ServerBase,
};
