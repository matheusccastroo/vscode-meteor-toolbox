const { workspace, window, Uri } = require("vscode");
const { PackageSpy, Npm, Cordova, Plugin } = require("./lib/packageMock");
const path = require("path");
const vm = require("vm");
const fsPromises = require("fs").promises;
const { TextDecoder } = require("util");
const { appendToExistingFile, isWindows } = require("./helpers");
const { JSCONFIG, METEOR_ARCHS } = require("./constants");
const json5 = require("json5");
const { uniq } = require("lodash");
const dontMerge = (_, source) => source;

async function addImportedPackagesToJsConfig() {
    const filesResults = await workspace.findFiles(".meteor/packages");
    const fileUri = filesResults[0];

    const content = await workspace.fs.readFile(fileUri);
    const packagesToLoad = new TextDecoder()
        .decode(content)
        .replace(/#.*/g, "")
        .split("\n")
        .filter((p) => p != "")
        .map((p) => p.split("@")[0].trim().replace(":", "_"));

    const versionMap = {};
    const fileArray = await workspace.findFiles(".meteor/versions");
    const newLocal = await workspace.fs.readFile(fileArray[0]);
    new TextDecoder()
        .decode(newLocal)
        .replace(/#.*/g, "")
        .split("\n")
        .filter((p) => p != "")
        .forEach((p) => {
            const sp = p.trim().split("@");
            Object.assign(versionMap, {
                [sp[0].replace(":", "_")]: {
                    version: sp[1],
                    packageName: sp[0],
                },
            });
        });

    const packageCodeAndPaths = await Promise.all(
        packagesToLoad.map(async (p) => {
            const homePath = isWindows()
                ? process.env.LOCALAPPDATA
                : process.env.HOME;

            const packagePath = `${homePath}/.meteor/packages/${p}/${versionMap[p].version}`;
            const obj = {};

            for (const arch of METEOR_ARCHS) {
                const code = await fsPromises.readFile(
                    `${packagePath}/${arch}.json`,
                    "utf-8"
                );

                obj[arch] = json5.parse(code);
            }

            return {
                obj,
                packageName: `meteor/${versionMap[p].packageName}`,
                packagePath: `${packagePath}/web.browser`,
            };
        })
    );
    const paths = {};

    packageCodeAndPaths.forEach(({ obj, packageName, packagePath }) => {
        const resources = [];

        METEOR_ARCHS.forEach((arch) => {
            const matchingEntry = obj[arch]?.resources;
            if (!matchingEntry.length) return;

            resources.push(
                matchingEntry
                    .filter((r) => r.extension == "js")
                    .filter((r) => !r.path.includes("test"))
                    .map((r) => `${packagePath}/${r.path}`)
            );
        });

        const _resources = uniq(resources.flat(1));
        if (!_resources.length) return;

        Object.assign(paths, {
            [packageName]: _resources,
        });
    });

    const resolvedPath = path.resolve(
        workspace.workspaceFolders[0].uri.path,
        JSCONFIG.uri
    );

    await appendToExistingFile(
        { compilerOptions: { paths: { ...paths } } },
        Uri.file(resolvedPath),
        dontMerge
    );

    window.showInformationMessage(
        "Successfully added imported packages to jsconfig file."
    );
}

async function addCustomPackageOptionsToJsConfig() {
    const meteorPackageDirsFromExtensionConfig = workspace
        .getConfiguration()
        .get("conf.settingsEditor.meteorToolbox.meteorPackageDirs")
        ?.split(";")
        ?.map((dir) => `${dir}/**/package.js`);

    const dirsToLook = [
        "packages/**/package.js",
        ...(meteorPackageDirsFromExtensionConfig || []),
    ];

    for (const directory of dirsToLook) {
        // Find all the local package.js files inside dirs folder
        const packageFileURIs = await workspace.findFiles(directory);

        if (!packageFileURIs.length) {
            window.showWarningMessage(
                `Could not find any local meteor package in ${
                    directory.split("/")[0]
                }`
            );
            continue;
        }

        const packageCodeAndPaths = await Promise.all(
            packageFileURIs.map(async (pkgUri) => {
                const fileContent = await workspace.fs.readFile(pkgUri);
                const fileContentAsString = new TextDecoder().decode(
                    fileContent
                );

                return {
                    code: fileContentAsString,
                    packagePath: workspace.asRelativePath(
                        path.parse(pkgUri.fsPath).dir
                    ),
                };
            })
        );

        const paths = packageCodeAndPaths
            .map(({ code, packagePath }) => {
                const sandbox = {
                    Package: new PackageSpy(),
                    Npm,
                    Cordova,
                    Plugin,
                };

                vm.createContext(sandbox);
                vm.runInContext(code, sandbox);

                const key = `meteor/${sandbox.Package.name}`;
                const value = sandbox.Package.mainModules.map((modulePath) =>
                    path.join(packagePath, modulePath)
                );

                return {
                    key,
                    value,
                };
            })
            .filter(({ value }) => value.length > 0)
            .reduce((acc, { key, value }) => {
                acc[key] = value;
                return acc;
            }, {});

        const resolvedPath = path.resolve(
            workspace.workspaceFolders[0].uri.path,
            JSCONFIG.uri
        );
        await appendToExistingFile(
            { compilerOptions: { paths: { ...paths } } },
            Uri.file(resolvedPath),
            dontMerge
        );
    }

    window.showInformationMessage(
        "Successfully added local packages to jsconfig file."
    );
}

module.exports = {
    addImportedPackagesToJsConfig,
    addCustomPackageOptionsToJsConfig,
};
