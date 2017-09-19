#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

VERSION= $(jq -r .version package.json)
ARTIFACTS="build node_modules src migrations seeds knexfile.js package.json"

##########################################
# Extract artifacts from build container #
##########################################
docker run --rm ${CONTAINER_NAME}:${BUILD_TAG} sh -c "npm prune --production && tar --create ${ARTIFACTS}" > artifact.tar

#######################################
# Create + publish artifact container #
#######################################

docker build -f Dockerfile \
             -t ${CONTAINER_NAME}:${VERSION} \
             -t ${CONTAINER_NAME}:latest \
             .

docker push ${CONTAINER_NAME}:${VERSION}

docker push ${CONTAINER_NAME}:latest

echo "Docker image graphistry/${CONTAINER_NAME}:${VERSION} successfully published."

echo "${VERSION}" > RELEASE
