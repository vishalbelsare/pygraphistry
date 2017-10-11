#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

MAJORMINOR=$(jq -r .version ../package.json | cut -d '.' -f 1,2)
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
ARTIFACTS="index.js logger.js config.js www node_modules test/appdata"

./build.sh

##########################################
# Extract artifacts from build container #
##########################################

docker run --rm \
    -e NODE_ENV=production \
    -e COMMIT_ID=${COMMIT_ID} \
    -e BRANCH_NAME=${BRANCH_NAME} \
    -e BUILD_NUMBER=${BUILD_NUMBER} \
    -v "$PWD":/artifacts \
    ${CONTAINER_NAME}:${BUILD_TAG} sh -c "
    npm run build &&
    rm -rf node_modules &&
    npm install --production --build-from-source=bcrypt &&
    tar -cf /artifacts/artifact.tar ${ARTIFACTS}"

#######################################
# Create + publish artifact container #
#######################################

docker build -f Dockerfile \
             -t ${CONTAINER_NAME}:${VERSION} \
             -t ${CONTAINER_NAME}:latest \
             .

docker push ${CONTAINER_NAME}:${VERSION}

docker push ${CONTAINER_NAME}:latest

echo "Docker image ${CONTAINER_NAME}:${VERSION} successfully published."

echo "${VERSION}" > RELEASE
