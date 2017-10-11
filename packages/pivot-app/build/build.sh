#!/bin/bash -ex

# silently cd into the pivot-app project directory
cd $(dirname "$0")/../ > /dev/null

if [ -z $BUILD_NUMBER ]; then export BUILD_NUMBER=$(jq -r .version ./package.json | cut -d '.' -f 3); fi
if [ -z $BUILD_TAG    ]; then export BUILD_TAG=${BUILD_TAG:-dev}-${BUILD_NUMBER}; fi

echo "$CONTAINER_NAME:$BUILD_TAG"


docker build \
    -f build/Dockerfile-build \
    --build-arg DEPS="$(cat ./package.json | jq -r '{dependencies, devDependencies}')" \
    -t ${CONTAINER_NAME}:${BUILD_TAG} .

echo "build $CONTAINER_NAME finished"
