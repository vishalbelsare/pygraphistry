# Pivot-app

# Install & Build

See main README

# Local dev

## Setup

Obtain the configuration file containing graphistry credentials `graphistryInternal.json`. Place it inside `config/`.

## Run

1. `npm run watch`
2. [localhost:3000/pivot](http://localhost:3000/pivot)

## Test

`npm run test`

# Docker

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
