#!/bin/bash -ex

cd $(dirname "$0")/../ > /dev/null

if [[ ! -d "$WHOLLY_INOCCUOUS" ]]; then
	echo "error: no secrets found!"
	echo "please set a WHOLLY_INOCCUOUS env var to the path of the wholly-innocuous directory"
	exit 1
fi

echo "viz-app build.sh args:"
echo "	build: $BUILD_TAG"
echo "	commit id: $COMMIT_ID"
echo "	branch name: $BRANCH_NAME"
echo "	container name: $CONTAINER_NAME"

NODE_ENV=${NODE_ENV:-development}

docker build -f build/dockerfiles/Dockerfile-build \
	--build-arg NODE_ENV=${NODE_ENV} \
	--build-arg BUILD_TAG=${BUILD_TAG} \
	--build-arg COMMIT_ID=${COMMIT_ID} \
	--build-arg BRANCH_NAME=${BRANCH_NAME} \
	--build-arg NPMRC=$(cat "$WHOLLY_INOCCUOUS/files/npm/rc") \
	-t ${CONTAINER_NAME}:${BUILD_TAG} .

echo "build $CONTAINER_NAME finished"
