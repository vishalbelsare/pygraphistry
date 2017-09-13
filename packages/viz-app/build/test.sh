#!/bin/bash -ex

cd $(dirname "$0") > /dev/null

BUILD_TAG=${1:-test-dev}
CONTAINER_NAME=${2:-graphistry/viz-app}
COMMIT_ID=${3:-$(git rev-parse --short HEAD)}
BRANCH_NAME=${4:-$(git name-rev --name-only HEAD)}

echo "viz-app test.sh args:"
echo "	build: $BUILD_TAG"
echo "	commit id: $COMMIT_ID"
echo "	branch name: $BRANCH_NAME"
echo "	container name: $CONTAINER_NAME"

sh ./build.sh ${BUILD_TAG} ${CONTAINER_NAME} ${COMMIT_ID} ${BRANCH_NAME}

TEST_CONTAINER_NAME=viz-app-${BUILD_TAG}

docker run -v "${PWD}/test-results":/viz-app/coverage/junit \
	--name ${TEST_CONTAINER_NAME} ${CONTAINER_NAME}:${BUILD_TAG} \
		npm run test:ci

docker rm ${TEST_CONTAINER_NAME}

echo "test $CONTAINER_NAME finished"
