class PackageSpy {
    constructor() {
        this.describe = this.describe.bind(this);
        this.onUse = this.onUse.bind(this);
        this.mainModules = [];
    }

    describe({ name }) {
        this.name = name;
    }

    registerBuildPlugin() {}
    onTest() {}

    onUse(onUseFunc) {
        onUseFunc({
            versionsFrom: () => {},
            use: () => {},
            imply: () => {},
            export: () => {},
            addFiles: () => {},
            addAssets: () => {},
            mainModule: (path) => {
                this.mainModules.push(path);
            },
        });
    }
}

exports.PackageSpy = PackageSpy;
exports.Npm = {
    depends: () => {},
    require: () => {},
};
exports.Cordova = {
    depends: () => {},
};
exports.Plugin = {
    registerSourceHandler: () => {},
    registerLinter: () => {},
    registerCompiler: () => {},
    registerMinifier: () => {},
};
