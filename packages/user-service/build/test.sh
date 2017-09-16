#!/bin/bash -ex

cd $(dirname "$0") > /dev/null

echo "user-service test.sh args:"
echo "	build: $BUILD_TAG"
echo "	container name: $CONTAINER_NAME"

NODE_ENV=test
PG_NAME=${PG_CONTAINER}-${BUILD_TAG}
PG_PARAMS="postgresql://${PG_USER}:${PG_PASS}@${PG_NAME}:${PG_PORT}/${DB_NAME}"

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

sh ./build.sh

docker run --rm \
	--link=${PG_NAME}:pg \
    --net ${GRAPHISTRY_NETWORK} \
	-v "${PWD}/test-results":/user-service/coverage/junit \
	-e NODE_ENV=${NODE_ENV} \
	-e GRAPHISTRY_SECRET=ASecretString \
	-e DBPORT=${PG_PORT} -e DBHOST=${PG_NAME} \
	-e DBNAME=${DB_NAME} -e DBUSER=${PG_USER} -e DBPASSWORD=${PG_PASS} \
	${CONTAINER_NAME}:${BUILD_TAG} \
		npm run test:ci

docker stop ${PG_NAME}
docker network disconnect ${GRAPHISTRY_NETWORK} ${PG_NAME}
docker rm ${PG_NAME}

echo "test $CONTAINER_NAME finished"
