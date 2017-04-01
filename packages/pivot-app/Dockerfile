FROM node:boron-slim

WORKDIR /pivot-app

ADD artifact.tar .

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*

#CMD will be appended by build.sh
