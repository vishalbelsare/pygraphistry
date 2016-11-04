FROM node:boron-slim

COPY . /pivot-app

WORKDIR /pivot-app

ARG BUILD_NUMBER
ARG COMMIT_ID
ARG REV_NAME

RUN npm install && npm run build

CMD npm start
