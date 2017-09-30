#!/bin/sh
docker run --rm -e PTEXT=$PTEXT -e ROUNDS=$ROUNDS node:alpine sh -c "npm install --silent bcrypt && node -p 'require(\"bcrypt\").hashSync(process.env.PTEXT, process.env.ROUNDS * 1)'"
