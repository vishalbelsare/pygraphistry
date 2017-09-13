#!/bin/bash -e

cd $(dirname $0) > /dev/null

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

docker run --rm ${CONTAINER_NAME}:${BUILD_TAG} \
	npm run build && \
	echo "viz-app version: $(npm view . version)"
	# npm publish

echo "publish $CONTAINER_NAME finished"
