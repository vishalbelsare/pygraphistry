#!/bin/bash -ex

MAJORMINOR=`jq -r .version package.json | cut -d '.' -f 1,2`
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
COMMIT_ID=`git rev-parse --short HEAD`
REV_NAME=`git name-rev --name-only HEAD`

ARTIFACTS="build node_modules tests"


################################
# Create & run build container #
################################

docker build -f Dockerfile-build \
       --build-arg TEST_BUILD=1
       --build-arg BUILD_NUMBER=$BUILD_NUMBER \
       --build-arg COMMIT_ID=$COMMIT_ID \
       --build-arg REV_NAME=$REV_NAME \
       -t graphistry/pivot-app:build \
       .

docker run --rm graphistry/pivot-app:build sh -c "tar --create ${ARTIFACTS}" > artifact.tar


####################################
# Create run CMD from package.json #
####################################

RUNCMD=`docker run --rm graphistry/pivot-app:build sh -c "cat package.json" | jq -r .scripts.start`

echo -e "\nCMD ${RUNCMD}" >> Dockerfile

cat Dockerfile

#######################################
# Create + publish artifact container #
#######################################

docker build -f Dockerfile -t graphistry/pivot-app:$VERSION .

docker push graphistry/pivot-app:$VERSION
