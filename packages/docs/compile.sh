#!/bin/bash

cp ../deploy/dockerfiles/instructions.md setup/instructions.md
docker run -v $PWD:/source jagregory/pandoc setup/instructions.md -o setup/instructions.html
cat setup/admin-pre.html setup/instructions.html setup/admin-post.html > setup/admin.html
