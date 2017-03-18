#!/bin/sh
docker run --rm -it -v ~/.npmrc:/root/.npmrc:ro -v "${PWD}":/app -v "${PWD}/../../.git":/app/.git:ro -v "${PWD}"/data_cache:/tmp/graphistry/data_cache -w /app -p 10000:10000 graphistry/baseapp-cpu sh -c "npm install && echo installed && npm build && echo built && npm run start:cpu-dev"
