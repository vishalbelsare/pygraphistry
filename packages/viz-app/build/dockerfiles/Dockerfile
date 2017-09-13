FROM graphistry/baseapp

COPY . /viz-app
WORKDIR /viz-app

ARG NPMRC
ARG BUILD_TAG
ARG COMMIT_ID
ARG BRANCH_NAME

ENV COMMIT_ID $COMMIT_ID
ENV BRANCH_NAME $BRANCH_NAME
ENV BUILD_NUMBER ${BUILD_TAG:-dev}

RUN echo $NPMRC >> /root/.npmrc

RUN npm install && npm run build

CMD ["sh", "-c", "echo 'viz-app says, \"hello, friend!\"'"]