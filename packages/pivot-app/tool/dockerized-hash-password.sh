#!/bin/sh
docker run --rm -e PTEXT=$PTEXT -e ROUNDS=$ROUNDS node:boron sh -c "npm install --silent bcrypt && node -p 'require(\"bcrypt\").hashSync(process.env.PTEXT, process.env.ROUNDS * 1)'"
