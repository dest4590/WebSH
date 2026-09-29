FROM lukemathwalker/cargo-chef:latest-rust-alpine AS chef
WORKDIR /app
RUN apk add --no-cache pkgconfig openssl-dev build-base clang curl git

FROM chef AS planner
COPY wasm-ssh /app/wasm-ssh
WORKDIR /app/wasm-ssh
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS wasm-builder
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh \
    && rustup target add wasm32-unknown-unknown

WORKDIR /app/wasm-ssh
COPY --from=planner /app/wasm-ssh/recipe.json recipe.json

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/wasm-ssh/target \
    cargo chef cook --release --target wasm32-unknown-unknown --recipe-path recipe.json

COPY wasm-ssh /app/wasm-ssh
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/wasm-ssh/target \
    wasm-pack build --target web --out-dir /app/frontend/public/wasm

FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY frontend/ .
COPY --from=wasm-builder /app/frontend/public/wasm ./public/wasm

RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S websh && adduser -S websh -G websh
USER websh

COPY --from=frontend-builder --chown=websh:websh /app/frontend/.output ./.output

EXPOSE 3000
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
CMD ["node", ".output/server/index.mjs"]