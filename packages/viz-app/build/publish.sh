#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

NODE_ENV=production

./build.sh

docker run --rm \
    -e NODE_ENV=${NODE_ENV} \
    -e COMMIT_ID=${COMMIT_ID} \
    -e BRANCH_NAME=${BRANCH_NAME} \
    ${CONTAINER_NAME}:${BUILD_TAG} \
    npm run build && npm publish

echo "publish $CONTAINER_NAME finished"
