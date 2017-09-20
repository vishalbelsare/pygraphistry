FROM node:8.5.0-slim

WORKDIR /user-service

ADD artifact.tar .

ENV NODE_ENV=production

CMD ["micro", "./src/index.js"]