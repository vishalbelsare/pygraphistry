#!/bin/bash -ex

cd $(dirname "$0") > /dev/null

docker build -t ${CONTAINER_NAME}:${BUILD_TAG} .