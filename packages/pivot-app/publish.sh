#!/bin/bash -ex

BUILD_TAG=graphistry/pivot-app:build
MAJORMINOR=`jq -r .version package.json | cut -d '.' -f 1,2`
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
ARTIFACTS="build node_modules test/appdata"

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

docker run --rm ${BUILD_TAG} sh -c "tar --create ${ARTIFACTS}" > artifact.tar


####################################
# Create run CMD from package.json #
####################################

RUNCMD=`docker run -i --rm ${BUILD_TAG} sh -c "cat package.json" | docker run -i --rm graphistry/jq -r '.scripts.start | split(" ") | tojson'`

echo -e "\nCMD ${RUNCMD}" >> Dockerfile


#######################################
# Create + publish artifact container #
#######################################

docker build -f Dockerfile \
             -t graphistry/pivot-app:${VERSION} \
             -t graphistry/pivot-app:latest \
             .

docker push graphistry/pivot-app:${VERSION}

docker push graphistry/pivot-app:latest

echo "Docker image graphistry/pivot-app:${VERSION} successfully published."

echo "${VERSION}" > RELEASE
