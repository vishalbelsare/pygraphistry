#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

MAJORMINOR=$(jq -r .version ../package.json | cut -d '.' -f 1,2)
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
ARTIFACTS="node_modules src migrations seeds knexfile.js package.json"

./build.sh

##########################################
# Extract artifacts from build container #
##########################################

docker run --rm -v "$PWD":/artifacts ${CONTAINER_NAME}:${BUILD_TAG} sh -c "
    rm -rf node_modules package-lock.json &&
    npm install --production &&
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
