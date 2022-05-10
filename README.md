# Meteor Toolbox

Extension to enable intelisense for Meteor core, added packages and custom packages. Also adds launch configurations for the browser (run/debug).

The packages watcher is made from [meteor-package-intellisense](https://github.com/mattblackdev/meteor-package-intellisense).

## Usage

Just install the extension and it will add the needed configuration for you.

Note: this extensions changes the `jsconfig.json` and `.vscode/launch.json`. Remember to not include those changes to your version control system, as they are scoped to your environment.

## Available commands

`Toggle Meteor Toolbox Auto Run` -> Toggle file watcher for packages folders.

`Run Meteor Toolbox set up manually` -> Run the extension manually, only one time (if autorun is not enabled).

`Run clear meteor build cache` -> Clear meteor build cache.

`Re-create Meteor Toolbox run options` -> Re-create `launch.json` file. Usefull when you change the port settings.

## Requirements

This extension only runs inside a Meteor project.

## Extension Settings

You can toggle the file watcher for the packages by running the command `Toggle Meteor Toolbox Auto Run` (it is enabled by default).
