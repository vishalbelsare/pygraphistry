#!/bin/bash -ex

# silently cd into the mono-repo root directory
cd "$ROOT_PATH" > /dev/null

echo "name: $PACKAGE_NAME"

DEPENDENCIES="$(
docker exec -t lerna \
 lerna exec \
    --loglevel=error \
    --scope ${PACKAGE_NAME} \
    --include-filtered-dependencies \
    -- echo \${PWD##*/$GRAPHISTRY_NAMESPACE/} | tr -d '\r')"

WORKSPACES=$(echo "$DEPENDENCIES" | awk \
    -v RS='' \
    -v OFS='", "' \
    'NF { $1 = $1; print "\"" $0 "\"" }')

# Synthesize a custom .dockerignore file because Docker
# doesn't do variable expansion in its COPY command :-(

DOCKER_INCLUDE_PACKAGES=$(echo "$DEPENDENCIES" | awk \
    -v RS='' \
    -v OFS='\n!' \
    'NF { $1 = $1; print "!" $0 "\n" }')

if [ -f .dockerignore ]; then
    mv .dockerignore .dockerignore.backup
    trap "rv=\$?; mv .dockerignore.backup .dockerignore; exit \$rv" ERR EXIT
fi

# Always include our dependencies' folders
echo "**/*
$DOCKER_INCLUDE_PACKAGES
" > .dockerignore

# Include dependencies' .dockerignore entries as well
find ${DEPENDENCIES} -type f -name .dockerignore | while read file; do \
    dep="${file%.dockerignore}";
    sed "s@^!\(.*\)@!${dep}\1@; s@^\(\*\*\/\*\)@${dep}\1@" $file >> .dockerignore
done

cat .dockerignore

docker build \
    -f "$PACKAGE_PATH/build/Dockerfile" \
    --build-arg WORKSPACES="${WORKSPACES}" \
    -t ${CONTAINER_NAME}:${BUILD_TAG} .

rm .dockerignore
