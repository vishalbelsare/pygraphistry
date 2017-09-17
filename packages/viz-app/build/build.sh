#!/bin/bash -ex

# silently cd into the viz-app project directory
cd $(dirname "$0")/../ > /dev/null

if [[ ! -d "$WHOLLY_INOCCUOUS" ]]; then
    echo "error: no secrets found!"
    echo "please set a WHOLLY_INOCCUOUS env var to the path of the wholly-innocuous directory"
    exit 1
fi

docker build \
    -f build/Dockerfile-build \
    --build-arg NPMRC="$(cat "$WHOLLY_INOCCUOUS/files/npm/rc")" \
    --build-arg DEPS="$(cat ./package.json | jq -r '{dependencies, devDependencies}')" \
    -t ${CONTAINER_NAME}:${BUILD_TAG} .

echo "build $CONTAINER_NAME finished"
