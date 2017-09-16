#!/bin/bash -ex

cd $(dirname "$0") > /dev/null

echo "viz-app test.sh args:"
echo "	build: $BUILD_TAG"
echo "	commit id: $COMMIT_ID"
echo "	branch name: $BRANCH_NAME"
echo "	container name: $CONTAINER_NAME"

sh ./build.sh

docker run --rm \
	-v "${PWD}/test-results":/viz-app/coverage/junit \
	${CONTAINER_NAME}:${BUILD_TAG} \
	npm run test:ci

echo "test $CONTAINER_NAME finished"
