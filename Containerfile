# Containerfile for the PocketBase MCP server (Podman)
FROM node:26-alpine AS builder

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN --mount=type=cache,target=/root/.npm npm install -g pnpm@12

COPY package.json pnpm-lock.yaml tsconfig.json ./

RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

COPY src/ ./src/

RUN pnpm run build

FROM node:26-alpine

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

# Credentials are provided at runtime via Podman secrets exported as environment variables:
#   podman secret create POCKETBASE_ADMIN_PASSWORD -
#   podman run --secret POCKETBASE_ADMIN_PASSWORD,type=env ...
CMD ["node", "build/index.js"]
