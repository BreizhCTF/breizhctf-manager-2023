FROM node:16-alpine AS builder

WORKDIR /build

COPY . .

RUN yarn install --frozen-lockfile

RUN yarn build

FROM node:16-alpine

WORKDIR /app

COPY package.* yarn.lock /app/

RUN yarn set version berry

RUN yarn install --frozen-lockfile

COPY --from=builder /build/dist /app/dist

CMD yarn prod
