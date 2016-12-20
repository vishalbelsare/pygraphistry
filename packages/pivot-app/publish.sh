#!/bin/bash -ex

TAG=graphistry/pivot-app:build
MAJORMINOR=`jq -r .version package.json | cut -d '.' -f 1,2`
VERSION=${MAJORMINOR}.${BUILD_NUMBER}
ARTIFACTS="build node_modules tests"

for ARG in "$@"; do
    case $ARG in
    --tag=*)
            TAG="${ARG#*=}"
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

docker run --rm ${TAG} sh -c "tar --create ${ARTIFACTS}" > artifact.tar


####################################
# Create run CMD from package.json #
####################################

RUNCMD=`docker run --rm graphistry/pivot-app:build sh -c "cat package.json" | jq -r .scripts.start`

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
