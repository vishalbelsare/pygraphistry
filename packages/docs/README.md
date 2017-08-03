# New Graphistry documentation

The content of this repo is used as the content of the root `/` path of a running Graphistry web app deployment.

**WARNING**: because the contents of this repo are used as the content for our web server, this file (any any other files in this repo) *may* be exposed publicly. Do not put sensitive information anywhere in this repo.


## Developing

To publish the latest updates from this repo:

1. Ensure all changes have been committed and the working directory is clean.
2. Run `npm version patch` to increment this module's version number.
    - This is needed so that the updated module can be published without conflicting with an existing published version).
3. Run `npm publish` to upload the current version to npm.
    - Ensure you have write access to the `@graphistry` npm organization, and are logged in to npm in your `npm` CLI tool.
4. Rebuild the `httpd` Docker container and deploy it
    - The `httpd` container runs `central`. By rebuilding it, it will install a fresh copy of `central` which will, in turn, install the latest version of this module as a dependency.
