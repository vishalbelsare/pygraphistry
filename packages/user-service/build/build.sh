#!/bin/bash -ex

cd $(dirname "$0")/../ > /dev/null

echo "user-service test.sh args:"
echo "	build: $BUILD_TAG"
echo "	container name: $CONTAINER_NAME"

docker build \
	-f build/dockerfiles/Dockerfile-build \
	-t ${CONTAINER_NAME}:${BUILD_TAG} .
