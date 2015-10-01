#!/usr/bin/env bash

# This moves Ace mode and snippets files for Graphistry's expression language to the server assets:

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
ASSETS_BASE_DIR=$DIR/../../../graph-viz/assets/libs/ace

for i in src src-noconflict src-min src-min-noconflict
do
    ASSETS_DIR=$ASSETS_BASE_DIR/$i
    FROM=$DIR/aceExpressionMode.js
    echo cp $FROM $ASSETS_DIR/mode-graphistry.js && echo $FROM -> $i
    FROM=$DIR/aceExpressionSnippets.js
    cp $FROM $ASSETS_DIR/snippets/graphistry.js && echo $FROM -> $i
done
