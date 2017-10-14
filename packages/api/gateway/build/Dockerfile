FROM node:alpine
RUN apk add --no-cache yarn postgresql-client
WORKDIR /api
ARG WORKSPACES
RUN echo "{\"private\": true, \"workspaces\": [${WORKSPACES}]}" >> ./package.json

COPY . .

ENV NODE_ENV=test

RUN yarn install \
    --strict-semver \
    --non-interactive \
    --ignore-optional \
    --link-duplicates

# todo:
CMD ["sh", "-c", "echo hello new york city"]
# CMD ["node", "./node_modules/micro/bin/micro", "./src/index.js"]