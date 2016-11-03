FROM node:boron-slim

COPY . /pivot-app

WORKDIR /pivot-app

ARG BUILD_NUMBER

RUN npm install && npm run build

CMD npm start
