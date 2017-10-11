#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

NODE_ENV=test

./build.sh

docker run --rm \
    -v "${PWD}/test-results":/pivot-app/coverage/junit \
    -e NODE_ENV=${NODE_ENV} \
    -e COMMIT_ID=${COMMIT_ID} \
    -e BRANCH_NAME=${BRANCH_NAME} \
    -e BUILD_NUMBER=${BUILD_NUMBER} \
    ${CONTAINER_NAME}:${BUILD_TAG} \
    npm run test:ci

echo "test $CONTAINER_NAME finished"
