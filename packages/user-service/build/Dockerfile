FROM node:boron-slim

WORKDIR /user-service

ADD artifact.tar .

ENV NODE_ENV=production

CMD ["node", "./src/index.js"]