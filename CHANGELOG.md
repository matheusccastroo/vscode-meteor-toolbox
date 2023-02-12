# Change Log

All notable changes to the "meteor-dev" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [18/01/23]

-   Run indexer on React projects.

## [07/01/23]

-   Fix issue where methods declared as an object property were not being properly indexed.
-   Fix issue where references were not being correctly processed on `typescript-server-plugin`.

## [02/01/23]

-   Add support for Meteor methods and publications jump to definition and references.
-   Add support for `ValidatedMethod` and `PublishComposite` packages.
-   Use the correct request when handling references.
-   Create `typescript-meteor-toolbox-plugin` to fix some conflicts between our LS and the TypeScript/JavaScript LS.

## [24/11/22]

-   Add option to ignore directories for indexing on the extension settings.

## [09/11/22]

-   Create Meteor Language Server
-   Add support for Blaze and Spacebars

## [06/09/22]

-   Fix issue with custom packages (#4)

## [19/05/22]

-   Add JSX support
-   Add additional arguments options to `launch.json`.

## [10/05/22]

-   Initial release
