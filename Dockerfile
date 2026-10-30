# syntax=docker/dockerfile:1

# Build dependencies in a disposable stage; ship only the app and Node runtime.
FROM node:24-trixie-slim AS build

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /app
COPY package.json package-lock.json ./
RUN node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 24 || (major === 24 && minor < 12)) process.exit(1)' \
 && npm ci --ignore-scripts --no-audit --no-fund

COPY . .
# Bundle the TypeScript server while esbuild is still installed. The runtime
# image prunes devDependencies, so it must not launch the server through tsx.
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# Minimal, non-root runtime; the image has no shell or package manager.
FROM gcr.io/distroless/nodejs24-debian13:nonroot

ENV NODE_ENV=production \
    PORT=3000

LABEL org.opencontainers.image.title="GLORIFIER" \
      org.opencontainers.image.description="Governed intelligence orchestration for AI-powered businesses" \
      org.opencontainers.image.source="https://github.com/GLORIFIER7/GLORIFIER" \
      org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app
COPY --from=build --chown=65532:65532 /app /app

EXPOSE 3000

# Exec-form healthcheck does not require a shell in the runtime image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Distroless supplies Node as its entrypoint. Run the bundled server directly;
# tsx is a devDependency and is intentionally absent from the production image.
CMD ["dist/server.cjs"]
