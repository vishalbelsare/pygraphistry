#!/bin/bash -ex

cd $(dirname "$0") > /dev/null

BUILD_TAG=${1:-test-dev}
CONTAINER_NAME=${2:-graphistry/user-service}

echo "viz-app test.sh args:"
echo "	build: $BUILD_TAG"

sh ./build.sh ${BUILD_TAG} ${CONTAINER_NAME}

TEST_CONTAINER_NAME=user-service-${BUILD_TAG}

docker run -v "${PWD}/test-results":/user-service/coverage/junit \
	--name ${TEST_CONTAINER_NAME} ${CONTAINER_NAME}:${BUILD_TAG} \
		npm run test:ci
  
docker rm ${TEST_CONTAINER_NAME}

echo "test $CONTAINER_NAME finished"