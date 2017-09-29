#!/bin/bash -ex

# silently cd into the pivot-app project directory
cd $(dirname "$0")/../ > /dev/null

if [[ ! -d "$WHOLLY_INOCCUOUS" ]]; then
    echo "error: no secrets found!"
    echo "please set a WHOLLY_INOCCUOUS env var to the path of the wholly-innocuous directory"
    exit 1
fi

if [ -z $BUILD_NUMBER ]; then export BUILD_NUMBER=$(jq -r .version ./package.json | cut -d '.' -f 3); fi
if [ -z $BUILD_TAG    ]; then export BUILD_TAG=${BUILD_TAG:-dev}-${BUILD_NUMBER}; fi

CONTAINER_NAME=graphistry/pivot-app

docker build \
    -f build/Dockerfile-build \
    --build-arg NPMRC="$(cat "$WHOLLY_INOCCUOUS/files/npm/rc")" \
    --build-arg DEPS="$(cat ./package.json | jq -r '{dependencies, devDependencies}')" \
    -t ${CONTAINER_NAME}:${BUILD_TAG} .

echo "build $CONTAINER_NAME finished"
