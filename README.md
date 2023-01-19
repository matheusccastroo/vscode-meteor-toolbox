# Meteor Toolbox

Extension to enable intelisense for Meteor core, added packages and custom packages. Also adds launch configurations for the browser (run/debug).

The packages watcher is inspired on [meteor-package-intellisense](https://github.com/mattblackdev/meteor-package-intellisense).

The extension is available on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=meteor-toolbox.meteor-toolbox) and on [Open VSX Registry](https://open-vsx.org/extension/meteor-toolbox/meteor-toolbox).

## Usage

Just install the extension and it will add the needed configuration for you.

Note: this extensions changes the `jsconfig.json` and `.vscode/launch.json`. Remember to not include those changes to your version control system, as they are scoped to your environment.

## Meteor Language Server

Meteor Toolbox is the only extension implementing a Meteor Language Server. It works for Blaze and React projects. Check it in action:

### Completions

![completion-template](/images/demo/demo-template-completion-items.gif)

![completion-meteor](/images/demo/demo-meteor-completion-items.gif)

### Go to Definition and References

![goto-definition](/images/demo/demo-methods-definitions-and-references.gif)

![goto-definition-templates](/images/demo/demo-blaze-template-definition.gif)

![goto-references](/images/demo/demo-template-helpers-definitions-and-references.gif)

And much more...

## Available commands

`Toggle Meteor Toolbox Auto Run` -> Toggle file watcher for packages folders.

`Run Meteor Toolbox set up manually` -> Run the extension manually, only one time (if autorun is not enabled).

`Run clear meteor build cache` -> Clear meteor build cache.

`Re-create Meteor Toolbox run options` -> Re-create `launch.json` file. Usefull when you change the port settings.

## Requirements

This extension only runs inside a Meteor project.
Monorepos are not supported yet.

## Extension Settings

-   `auto` -> Enable the file watcher for local packages. You can also set this option by running the command `Toggle Meteor Toolbox Auto Run` (it is enabled by default).

-   `port` -> Set the port to use for meteor run/debug. Default to 3000.

-   `additionalArgs` -> Set additional args to meteor run/debug configuration. Re-create the run options when changing this setting.

-   `meteorPackageDirs` -> Use a custom packages diretory.

-   `ignoreDirsOnIndexing` -> List of directories to ignore when the Meteor Language Server is indexing the project.

## Authors

<div>
  <table>
  <tr>
    <td valign="top">
      <a href="https://github.com/matheusccastroo/">
 <img style="border-radius: 50%;" src="https://avatars.githubusercontent.com/u/48069682?v=4" width="100px;" alt=""/>
 <br />
 <sub><b>Matheus Castro</b></sub></a> 
     <br />
    <a href="https://github.com/matheusccastroo" title="Github"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white"/></a>
    </td>
    <td valign="top">
      <a href="https://github.com/renanccastro/">
 <img style="border-radius: 50%;" src="https://avatars.githubusercontent.com/u/3637255?v=4" width="100px;" alt=""/>
 <br />
 <sub><b>Renan Castro</b></sub></a>
    <br />
    <a href="https://github.com/renanccastro" title="Github"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white"/></a>
    </td>
  </tr>
</table>

</div>
