FROM lukemathwalker/cargo-chef:latest-rust-slim-bookworm AS chef
WORKDIR /app

FROM chef AS planner
WORKDIR /app/backend
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/ .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
WORKDIR /app/backend
COPY --from=planner /app/backend/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

COPY backend/ .
RUN cargo build --release --bin websh-backend

FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash websh
RUN mkdir -p /app/data && chown -R websh:websh /app
USER websh

COPY --from=builder /app/backend/target/release/websh-backend /app/websh-backend

EXPOSE 5151
CMD ["/app/websh-backend"]