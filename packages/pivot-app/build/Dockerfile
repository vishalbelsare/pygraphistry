FROM node:8.6.0-alpine

WORKDIR /pivot-app
RUN apk add --no-cache jq
ENV NODE_ENV=production

ADD artifact.tar .

CMD ["node", "./index.js"]