#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

if [ -z $COMMIT_ID    ]; then export COMMIT_ID=$(git rev-parse --short HEAD); fi
if [ -z $BRANCH_NAME  ]; then export BRANCH_NAME=$(git name-rev --name-only HEAD); fi
if [ -z $BUILD_NUMBER ]; then export BUILD_NUMBER=$(jq -r .version ../package.json | cut -d '.' -f 3); fi
if [ -z $BUILD_TAG    ]; then export BUILD_TAG=${BUILD_TAG:-dev}-${BUILD_NUMBER}; fi

export NODE_ENV=test
export CONTAINER_NAME=graphistry/pivot-app

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
