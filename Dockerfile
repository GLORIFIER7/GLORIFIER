# syntax=docker/dockerfile:1

# Build dependencies in a disposable stage; ship only the app and Node runtime.
FROM node:24-trixie-slim AS build

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /app
COPY package.json package-lock.json ./
RUN node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 24 || (major === 24 && minor < 12)) process.exit(1)' \
 && npm ci --include=dev --ignore-scripts --no-audit --no-fund

COPY . .
# Bundle the TypeScript server while esbuild is still installed.
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# Debian unstable currently carries the upstream zlib fix for both reported
# gzwrite heap-buffer-overflow CVEs. Enforce the fixed package floor at build time.
FROM debian:unstable-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000

LABEL org.opencontainers.image.title="GLORIFIER" \
      org.opencontainers.image.description="Governed intelligence orchestration for AI-powered businesses" \
      org.opencontainers.image.source="https://github.com/GLORIFIER7/GLORIFIER" \
      org.opencontainers.image.licenses="Apache-2.0"

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      libatomic1 \
      libgcc-s1 \
      libssl3t64 \
      libstdc++6 \
      zlib1g; \
    zlib_version="$(dpkg-query -W -f='${Version}' zlib1g)"; \
    dpkg --compare-versions "$zlib_version" ge '1:1.3.dfsg+really1.3.2-4'; \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p /app; \
    chown 65532:65532 /app

COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=65532:65532 /app /app

USER 65532:65532
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/node"]
CMD ["dist/server.cjs"]
