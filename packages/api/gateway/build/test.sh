#!/bin/bash -ex

# silently cd into this shell script's directory
cd $(dirname "$0") > /dev/null

PG_NAME=${PG_NAME}-${BUILD_TAG}
PG_PARAMS="postgresql://${PG_USER}:${PG_PASS}@${PG_NAME}:${PG_PORT}/${DB_NAME}"

trap "\
rv=\$?; \
docker stop $PG_NAME && \
    docker network disconnect $GRAPHISTRY_NETWORK $PG_NAME && \
    docker rm -f $PG_NAME || true; \
exit \$rv" EXIT

docker run -d \
    --name ${PG_NAME} \
    --net ${GRAPHISTRY_NETWORK} \
    -e POSTGRES_DB=${DB_NAME} \
    -e POSTGRES_USER=${PG_USER} \
    -e POSTGRES_PASSWORD=${PG_PASS} \
    postgres:9-alpine

sleep 5

while [[ ! $(docker exec $PG_NAME psql -c "select 'the database is up'" $PG_PARAMS) ]]; do
    sleep 5
done

./build.sh

# still todo:
# - add gateway test:ci package.json script that runs dependencies' test:ci scripts
# - make all submodules put test results into the same folder

docker run --rm \
    --link=${PG_NAME}:pg \
    --net ${GRAPHISTRY_NETWORK} \
    -v "${PWD}/test-results":/api/coverage \
    -e NODE_ENV=${NODE_ENV} \
    -e JEST_JUNIT_OUTPUT=/api/coverage \
    -e DBPORT=${PG_PORT} -e DBHOST=${PG_NAME} \
    -e DBNAME=${DB_NAME} -e DBUSER=${PG_USER} -e DBPASSWORD=${PG_PASS} \
    ${CONTAINER_NAME}:${BUILD_TAG} \
        npx lerna run test:ci

echo "test $CONTAINER_NAME finished"
