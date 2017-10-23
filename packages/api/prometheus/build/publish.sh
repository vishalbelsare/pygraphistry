#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null
echo $PWD

MAJORMINOR=$(jq -r .version ../package.json | cut -d '.' -f 1,2)
VERSION=${MAJORMINOR}.${BUILD_NUMBER}

./build.sh

docker build -f Dockerfile \
             -t ${CONTAINER_NAME}:${VERSION} \
             -t ${CONTAINER_NAME}:latest \
             .

docker push ${CONTAINER_NAME}:${VERSION}

docker push ${CONTAINER_NAME}:latest

echo "Docker image ${CONTAINER_NAME}:${VERSION} successfully published."

echo "${VERSION}" > RELEASE
