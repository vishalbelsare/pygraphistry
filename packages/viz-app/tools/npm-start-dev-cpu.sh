#!/bin/sh
if [ $INSTALL ]
then
  docker run --rm -v ~/.npmrc:/root/.npmrc:ro -v "${PWD}":/app -v "${PWD}/../../.git":/app/.git:ro -w /app graphistry/baseapp-cpu npm install
fi

docker run --rm -it -v "${PWD}":/app -v "${PWD}/../../.git":/app2/.git:ro -v "${PWD}"/data_cache:/tmp/graphistry/data_cache -w /app2 -p 10000:10000 graphistry/baseapp-cpu sh -c "cp -r /app/* /app2 && npm run build && npm run start:cpu-dev"
