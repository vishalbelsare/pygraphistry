# DEPRECATED

For global app config, use `node-convict` in the appropriate repo instead

# LEGACY

Legacy config options around non-sensitive defaults. Others are in deploy, jenkins, and the secrets area. Cascades with commandline and environment variables.

For deployment, jenkins manages the package version and handles publishing to npm.

## Local Dev

`npm install`

## Staging

For staging with downstream deps,  locally `npm publish` an *alpha* channel version, and deploy-from-branch on the relevant downstreams (central, vizapp, ...) that are modified to use the alpha channel (in theory)

## Landing & Publishing


1. Gitflow: Convential Commits on a branch, PRs, then squash & merge
2. Publish @graphistry/config to npm: use the jenkins job via Build with Parameters: http://deploy.graphistry.com/job/Build%20and%20push%20config%20package/ 
3. Downstream deps:
  * central: manually trigger jenkins job  http://deploy.graphistry.com/job/Build%20and%20push%20central%20npm%20packages/
  * viz-app: update `vizapp/packages/vizapp/package.json`'s  `@graphistry/config` version  to published version and manually trigger jenkins job: http://deploy.graphistry.com/job/Build%20and%20push%20central%20npm%20packages/ 
