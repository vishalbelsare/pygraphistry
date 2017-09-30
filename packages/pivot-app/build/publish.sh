#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

if [ -z $COMMIT_ID    ]; then export COMMIT_ID=$(git rev-parse --short HEAD); fi
if [ -z $BRANCH_NAME  ]; then export BRANCH_NAME=$(git name-rev --name-only HEAD); fi
if [ -z $BUILD_NUMBER ]; then export BUILD_NUMBER=$(jq -r .version ../package.json | cut -d '.' -f 3); fi
if [ -z $BUILD_TAG    ]; then export BUILD_TAG=${BUILD_TAG:-dev}-${BUILD_NUMBER}; fi

MAJORMINOR=$(jq -r .version ../package.json | cut -d '.' -f 1,2)
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
ARTIFACTS="index.js logger.js config.js www node_modules test/appdata"

export NODE_ENV=production
export CONTAINER_NAME=graphistry/pivot-app

./build.sh

##########################################
# Extract artifacts from build container #
##########################################

docker run --rm \
    -e NODE_ENV=${NODE_ENV} \
    -e COMMIT_ID=${COMMIT_ID} \
    -e BRANCH_NAME=${BRANCH_NAME} \
    -e BUILD_NUMBER=${BUILD_NUMBER} \
    -v "$PWD":/artifacts \
    ${CONTAINER_NAME}:${BUILD_TAG} sh -c "
    npm run build &&
    rm -rf node_modules &&
    npm install --production &&
    npm rebuild bcrypt --build-from-source &&
    tar -cf /artifacts/artifact.tar ${ARTIFACTS}"

#######################################
# Create + publish artifact container #
#######################################

docker build -f Dockerfile \
             -t ${CONTAINER_NAME}:${VERSION} \
             -t ${CONTAINER_NAME}:latest \
             .

docker push ${CONTAINER_NAME}:${VERSION}

docker push ${CONTAINER_NAME}:latest

echo "Docker image ${CONTAINER_NAME}:${VERSION} successfully published."

echo "${VERSION}" > RELEASE
