const glueExtByLanguageName = {
    tsx: [".ts", ".tsx"],
    java: [".java"],
    c_sharp: [".cs"],
    php: [".php"],
    ruby: [".rb"],
    python: [".py"],
    rust: [".rs"],
};
const entries = Object.entries(glueExtByLanguageName).reduce((prev, entry) => {
    const newEntries = entry[1].map((ext) => [ext, entry[0]]);
    return prev.concat(newEntries);
}, []);
const glueLanguageNameByExt = Object.fromEntries(entries);
const glueExtensions = new Set(Object.keys(glueLanguageNameByExt));
async function loadGlueSources(files, globs) {
    return loadSources(files, globs, glueExtensions, glueLanguageNameByExt);
}
function getLanguage(ext) {
    return glueLanguageNameByExt[ext];
}
async function loadAllSources(files) {
    return loadSources(
        files,
        ["*/**{.js,.ts,.html}"],
        new Set([".js", ".ts", ".html"]),
        { ".js": "javascript", ".ts": "typescript", ".html": "html" }
    );
}
async function findUris(files, globs) {
    // Run all the globs in parallel
    const urisPromises = globs.reduce((prev, glob) => {
        const urisPromise = files.findUris(glob);
        return prev.concat(urisPromise);
    }, []);
    const uriArrays = await Promise.all(urisPromises);
    // Flatten them all
    const uris = uriArrays.flatMap((paths) => paths);
    return [...new Set(uris).values()].sort();
}
function extname(uri) {
    // Roughly-enough implements https://nodejs.org/dist/latest-v18.x/docs/api/path.html#pathextnamepath
    return uri.substring(uri.lastIndexOf("."), uri.length) || "";
}
async function loadSources(files, globs, extensions, languageNameByExt) {
    const uris = await findUris(files, globs);
    return Promise.all(
        uris
            .filter((uri) => extensions.has(extname(uri)))
            .map(
                (uri) =>
                    new Promise((resolve) => {
                        const languageName = languageNameByExt[extname(uri)];
                        return files.readFile(uri).then((content) =>
                            resolve({
                                languageName,
                                content,
                                uri,
                            })
                        );
                    })
            )
    );
}

module.exports = {
    loadAllSources,
};
