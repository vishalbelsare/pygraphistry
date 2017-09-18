#!/bin/bash -ex

# silently cd into the user-service project directory
cd $(dirname "$0")/../ > /dev/null

docker build \
    -f build/Dockerfile-build \
    --build-arg DEPS="$(cat package.json | jq -r '{dependencies, devDependencies}')" \
    -t ${CONTAINER_NAME}:${BUILD_TAG} .
