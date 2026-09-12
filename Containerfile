# Containerfile for the PocketBase MCP server (Podman)
# Use an official Node.js image as a base
FROM node:26-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Install pnpm (major version pinned in package.json via packageManager)
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN --mount=type=cache,target=/root/.npm npm install -g pnpm@12

# Copy the manifest and lockfile
COPY package.json pnpm-lock.yaml tsconfig.json ./

# Install project dependencies
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

# Copy the rest of the application's source code
COPY src/ ./src/

# Build the TypeScript project
RUN pnpm run build

# Use a lightweight Node.js image for the production build
FROM node:26-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the compiled server and dependencies from the builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

# Expose the port on which the server will run (assume 3000, replace if necessary)
EXPOSE 3000

# Credentials are provided at runtime via Podman secrets exported as environment variables:
#   podman secret create POCKETBASE_ADMIN_PASSWORD -
#   podman run --secret POCKETBASE_ADMIN_PASSWORD,type=env ...
CMD ["node", "build/index.js"]
