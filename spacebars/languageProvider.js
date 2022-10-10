vscode.languages.registerHoverProvider("javascript", {
    provideHover(document, position, token) {
        return {
            contents: ["Hover Content"],
        };
    },
});
