#!/bin/bash -ex

TAG=graphistry/pivot-app:build
COMMIT_ID=`git rev-parse --short HEAD`
REV_NAME=`git name-rev --name-only HEAD`
TARGET= # Parsed from command line args

for ARG in "$@"; do
    case $ARG in
    --target=*)
        TARGET="${ARG#*=}"
        shift
        ;;
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

if [[ ${TARGET} != "testing" ]] && [[ ${TARGET} != "production" ]] ; then
    echo "Must specify target via --target. Acceptable values are (testing, production)"
fi


###########################
# Create build cointainer #
###########################

docker build -f Dockerfile-build \
       --build-arg TEST_BUILD=$([[ $TARGET == 'testing' ]] && echo "1")
       --build-arg BUILD_NUMBER=${BUILD_NUMBER} \
       --build-arg COMMIT_ID=${COMMIT_ID} \
       --build-arg REV_NAME=${REV_NAME} \
       -t ${TAG} \
       .

echo "Docker image ${TAG} successfully built."
