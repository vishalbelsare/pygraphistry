# Pivot-app

## Development Setup

### Prerequisites

* Node 6.x.x (Production is LTS Boron, the node:boron-slim container)
* NPM 3.x.x

### Setup

1. Create an account on [NPM](https://www.npmjs.com/)
2. Ask Matt to add your account to the Graphistry organization
3. Register NPM with your online account: `npm adduser`
4. Clone pivot-app using git. Open terminal in the pivot-app folder.
5. Install dependencies with `npm install`.
6. Obtain the configuration file containing graphistry credentials `graphistryInternal.json`. Place it inside `config/`.
7. Compile with `npm run dev` (dev build) or `npm run build` (prod build).
8. Run with `npm start`.
9. Open browser on [localhost:3000](http://localhost:3000)

## Testing

Jenkins should build the pivot-app artifact automatically.
You can find the list of builds and artifacts on [Jenkins](http://deploy.graphistry.com/view/Build/job/Build%20pivot-app/) and [DockerHub](https://hub.docker.com/r/graphistry/pivot-app/tags/).

### Quick test on Staging

Run the container while keeping it attached to the terminal to print logs. The container stops when you CTRL-C.

1. `ssh staging.graphistry.com`
2. `docker login`
3. (Optional) Copy connector configuration/credentials in `./config`.
4. Replace *X.Y.Z* by the artifact version and run

 ```bash
docker run --rm -i -t --network host \
      -v `pwd`/config:/pivot-app/config \
	   --env HOST=0.0.0.0 --env PORT=4000 \
	   graphistry/pivot-app:X.Y.Z | bunyan -o short
```
5. Load [http://staging.graphistry.com:4000](http://staging.graphistry.com:4000)

### Reading Logs

Staging does not have bunyan installed locally. To parse and print logs, you can use the container's bunyan:

```bash
docker exec -i <CONTAINERID> /usr/local/bin/node node_modules/bunyan/bin/bunyan --no-pager -o short <LOGFILE>
```

## Running Official Builds Locally

1. In any directory, create a folder named `./config`.
2. Create `./config/local.json`, a configuration file for *localhost* by adapting the example below:

   ```json
   {
       "port": 3000,
       "host": "127.0.0.1",
       "graphistry": {
           "host": "localhost:4000",
           "key": "XXX"
       },
       "splunk": {
           "user": "admin",
           "key": "1234",
           "host": "localhost:5000"
       }
   }
```

3. Select a build to run on [DockerHub](https://hub.docker.com/r/graphistry/pivot-app/tags/)
4. Run the pivot-app image tagged *X.Y.Z* with

   ```bash
docker run --rm -i -t --network host \
     -v `pwd`/config:/pivot-app/config \
      graphistry/pivot-app:X.Y.Z
```

   You may need to run `docker login` first.

5. Stop pivot-app using Ctrl-C.
