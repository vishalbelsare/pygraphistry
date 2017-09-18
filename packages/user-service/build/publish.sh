#!/bin/bash -ex

BUILD_TAG=graphistry/user-service:build
MAJORMINOR=`jq -r .version package.json | cut -d '.' -f 1,2`
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
ARTIFACTS="build node_modules src migrations seeds knexfile.js package.json"

for ARG in "$@"; do
    case $ARG in
    --build-tag=*)
            BUILD_TAG="${ARG#*=}"
            shift
            ;;
    *)
        echo "Unknown argument $ARG"
        exit 1
        ;;
    esac
done


##########################################
# Extract artifacts from build container #
##########################################

docker run --rm ${BUILD_TAG} sh -c "npm prune --production && tar --create ${ARTIFACTS}" > artifact.tar

#######################################
# Create + publish artifact container #
#######################################

docker build -f Dockerfile \
             -t graphistry/user-service:${VERSION} \
             -t graphistry/user-service:latest \
             .

docker push graphistry/user-service:${VERSION}

docker push graphistry/user-service:latest

echo "Docker image graphistry/user-service:${VERSION} successfully published."

echo "${VERSION}" > RELEASE
