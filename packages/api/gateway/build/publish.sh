#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

MAJORMINOR=$(jq -r .version ../package.json | cut -d '.' -f 1,2)
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
ARTIFACTS="node_modules packages package.json"

./build.sh

##########################################
# Extract artifacts from build container #
##########################################

docker run --rm \
    -e NODE_ENV=${NODE_ENV} \
    -v "$PWD":/artifacts ${CONTAINER_NAME}:${BUILD_TAG} sh -c "
    npx lerna clean --yes &&
    rm -rf node_modules package-lock.json &&
    npm install --production --ignore-optional &&
    npx lerna bootstrap --production --ignore-optional &&
    tar -cf /artifacts/artifact.tar ${ARTIFACTS}"

#######################################
# Create + publish artifact container #
#######################################

cp Dockerfile Dockerfile-pub
trap "rv=\$?; rm Dockerfile-pub; exit \$rv" EXIT

# TODO: make this generic/configurable
PM2_APP_CONFIG_PATH=packages/api/gateway/pm2.config.js

echo "
CMD [\"pm2-docker\", \"$PM2_APP_CONFIG_PATH\"]" >> Dockerfile-pub

docker build -f Dockerfile-pub \
             -t ${CONTAINER_NAME}:latest \
             -t ${CONTAINER_NAME}:${VERSION} \
             .

docker push ${CONTAINER_NAME}:${VERSION}

docker push ${CONTAINER_NAME}:latest

cat Dockerfile-pub

echo "Docker image ${CONTAINER_NAME}:${VERSION} successfully published."

echo "${VERSION}" > RELEASE
