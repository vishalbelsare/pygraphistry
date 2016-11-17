# Pivot-app

## Development Setup

### Prerequisites

* Node 6.x.x
* NPM 3.x.x

### Setup

1. Create an account on [NPM](https://www.npmjs.com/)
2. Ask Matt to add your account to the Graphistry organization
3. Register NPM with your online account: `npm adduser`
4. Clone pivot-app using git. Open terminal in the pivot-app folder.
5. Install dependencies with `npm install`.
6. Compile with `npm run dev`
7. Run with `npm run watch`
8. Open browser on [localhost:3000](http://localhost:3000)

## Testing on Staging

Jenkins should build the pivot-app artifact automatically. You can find the list of builds and artifacts on [Jenkins](http://deploy.graphistry.com/view/Build/job/Build%20pivot-app/) and [DockerHub](https://hub.docker.com/r/graphistry/pivot-app/tags/).

1. `ssh staging.graphistry.com`
2. `docker login`
3. Pull and run image *pivot-app:X.Y.Z*

    ```bash
docker run --network host \
-v `pwd`/pivot-data:/pivot-app/data \
--env PIVOTAPP_DATADIR=data --env PORT=4000 --env HOST=0.0.0.0 \
-i -t graphistry/pivot-app:X.Y.Z
```
4. Load [http:/staging.graphistry.com:4000](http:/staging.graphistry.com:4000)

## Localhost

1. Run a stock splunk instance; mirror our splunk datasets & username/pwd
2. Run standard vizapp
3. In pivot-app, run "./run.pivot.sh"
