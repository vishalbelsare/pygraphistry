#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

NODE_ENV=production

./build.sh

docker run --rm \
    -e NODE_ENV=${NODE_ENV} \
    ${CONTAINER_NAME}:${BUILD_TAG} \
    sh -c "npm install"

echo "publish $CONTAINER_NAME finished"
