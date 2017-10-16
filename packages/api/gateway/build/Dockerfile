FROM node:alpine

WORKDIR /api
RUN apk add --no-cache postgresql-client && \
    npm i --production --ignore-optional -g pm2

ENV NODE_ENV=production

ADD artifact.tar .

# CMD intentionally omitted, added by publish.sh
