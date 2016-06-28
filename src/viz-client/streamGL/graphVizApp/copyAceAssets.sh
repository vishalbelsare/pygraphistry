#!/usr/bin/env bash

# This moves Ace mode and snippets files for Graphistry's expression language to the server assets:

ASSETS_BASE_DIR=../graph-viz/assets/libs/ace

if [ ! -d "$ASSETS_BASE_DIR" ]; then
    echo "Run this from the root of StreamGL; can't find: $ASSETS_BASE_DIR"
    exit 1
fi

SRC_DIR=src/graphVizApp/

if [ ! -d "$SRC_DIR" ]; then
    echo "Run this from the root of StreamGL; can't find: $ASSETS_BASE_DIR"
    exit 1
fi

for i in src src-noconflict src-min src-min-noconflict
do
    ASSETS_DIR=$ASSETS_BASE_DIR/$i
    FROM=$SRC_DIR/aceExpressionMode.js
    cp $FROM $ASSETS_DIR/mode-graphistry.js
    FROM=$SRC_DIR/aceExpressionSnippets.js
    cp $FROM $ASSETS_DIR/snippets/graphistry.js
done
