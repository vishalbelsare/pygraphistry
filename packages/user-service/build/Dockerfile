FROM node:8.5.0-slim

WORKDIR /user-service

ADD artifact.tar .

ENV NODE_ENV=production

CMD ["node", "./node_modules/micro/bin/micro", "./src/index.js"]