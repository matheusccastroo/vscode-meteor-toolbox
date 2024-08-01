const { workspace } = require("vscode");

const METEOR_ARCHS = ["web.browser", "web.cordova", "os"];

const JSCONFIG = {
    uri: "jsconfig.json",
    baseConfig: {
        compilerOptions: {
            checkJs: true,
            allowJs: true,
            jsx: "react-jsx",
            baseUrl: ".",
            paths: {
                ["/*"]: ["./*"],
            },
        },
        typeAcquisition: {
            include: ["meteor"],
        },
        exclude: ["node_modules", ".meteor"],
    },
};

const BASE_LAUNCH_CONFIG = {
    uri: ".vscode/launch.json",
    baseConfig: () => {
        const portToUse = workspace
            .getConfiguration()
            .get("conf.settingsEditor.meteorToolbox.port");

        const additionalArgs =
            workspace
                .getConfiguration()
                .get("conf.settingsEditor.meteorToolbox.additionalArgs")
                ?.split(" ") || [];

        return {
            version: "0.2.0",
            configurations: [
                {
                    type: "node",
                    request: "launch",
                    name: "Meteor: Run",
                    runtimeExecutable: "meteor",
                    outputCapture: "std",
                    noDebug: "true",
                    runtimeArgs: [
                        "run",
                        "--port",
                        portToUse,
                        ...additionalArgs,
                    ],
                },
                {
                    type: "node",
                    request: "launch",
                    name: "Meteor: Debug",
                    runtimeExecutable: "meteor",
                    runtimeArgs: [
                        "run",
                        "--port",
                        portToUse,
                        ...additionalArgs,
                        "--inspect-brk",
                    ],
                    outputCapture: "std",
                    serverReadyAction: {
                        pattern: "App running at: http://localhost:([0-9]+)/",
                        uriFormat: "http://localhost:%s",
                        action: "debugWithChrome",
                    },
                },
            ],
        };
    },
};

module.exports = {
    JSCONFIG,
    BASE_LAUNCH_CONFIG,
    METEOR_ARCHS,
};
