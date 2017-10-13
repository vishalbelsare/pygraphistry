#!/bin/bash -ex

# silently cd into the pivot-app project directory
cd $(dirname "$0")/../ > /dev/null

echo "$CONTAINER_NAME:$BUILD_TAG"


docker build \
    -f build/Dockerfile-build \
    --build-arg DEPS="$(cat ./package.json | jq -r '{dependencies, devDependencies}')" \
    -t ${CONTAINER_NAME}:${BUILD_TAG} .

echo "build $CONTAINER_NAME finished"
