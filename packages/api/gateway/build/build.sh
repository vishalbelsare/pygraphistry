#!/bin/bash -ex

# silently cd into the mono-repo root directory
cd "$ROOT_PATH" > /dev/null

echo "name: $PACKAGE_NAME"

DEPENDENCIES="$(
docker run --rm \
    -v "${PWD}":/${GRAPHISTRY_NAMESPACE} lerna \
    lerna exec \
        --loglevel=error \
        --scope ${PACKAGE_NAME} \
        --include-filtered-dependencies \
        -- echo \${PWD##*/$GRAPHISTRY_NAMESPACE/} | tr -d '\r')"

if [ -z $DEPENDENCIES ]; then exit 0; fi

# Synthesize a custom .dockerignore file because Docker
# doesn't do variable expansion in its COPY command :-(

DOCKER_INCLUDES=$(echo "$DEPENDENCIES" | awk \
    -v RS='' \
    -v OFS='\n!' \
    'NF { $1 = $1; print "!" $0 "\n" }')

if [ -z $DOCKER_INCLUDES ]; then exit 0; fi

if [ -f .dockerignore ]; then
    mv .dockerignore .dockerignore.backup
    trap "rv=\$?; mv .dockerignore.backup .dockerignore; exit \$rv" EXIT
fi

# Always include our dependencies' folders
echo "**/*
!.npmrc
$DOCKER_INCLUDES" > .dockerignore

# Include dependencies' .dockerignore entries as well
find ${DEPENDENCIES} -type f -name .dockerignore | while read file; do \
    dep="${file%.dockerignore}";
    sed "s@^!\(.*\)@!${dep}\1@; s@^\(\*\*\/\*\)@${dep}\1@" $file >> .dockerignore
done

cat .dockerignore

LERNA_VERSION="2.4.0"
LERNA_PACKAGES=$(echo "$DEPENDENCIES" | awk \
    -v RS='' \
    -v OFS='", "' \
    'NF { $1 = $1; print "\"" $0 "\"" }')

LERNA_JSON="{\"packages\":[${LERNA_PACKAGES}],\"lerna\":\"$LERNA_VERSION\"}"
PACKAGE_JSON="{\"private\":true,\"dependencies\": {\"lerna\":\"$LERNA_VERSION\"}}"

docker build \
    --build-arg LERNA_JSON="${LERNA_JSON}" \
    --build-arg PACKAGE_JSON="${PACKAGE_JSON}" \
    -f "$PACKAGE_PATH/build/Dockerfile-build" \
    -t ${CONTAINER_NAME}:${BUILD_TAG} .

rm .dockerignore
