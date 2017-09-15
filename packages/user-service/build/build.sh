#!/bin/bash -ex

cd $(dirname "$0") > /dev/null

BUILD_TAG=${1:-test-dev}
CONTAINER_NAME=${2:-graphistry/user-service}

echo "viz-app test.sh args:"
echo "	build: $BUILD_TAG"

docker build -f build/dockerfiles/Dockerfile-build \
	--build-arg NODE_ENV=${NODE_ENV} \
	-t ${CONTAINER_NAME}:${BUILD_TAG} .
