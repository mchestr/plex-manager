# Node 24 LTS, pinned by digest; Dependabot's docker entry keeps tag and digest current.
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
# No native toolchain: zlib-sync is an optional dependency, so `npm ci` skips its
# failed build and discord.js falls back to an uncompressed gateway connection.
# Alpine packages follow the digest-pinned base; a pinned apk version breaks
# when the release drops it.
# hadolint ignore=DL3018
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# The Prisma CLI the entrypoint runs migrations with: exact pins and its own
# lockfile (docker/prisma-cli), production dependencies only (SEC-03).
FROM base AS prisma-cli
WORKDIR /opt/prisma-cli
COPY docker/prisma-cli/package.json docker/prisma-cli/package-lock.json ./
RUN npm ci --omit=dev --prefix /opt/prisma-cli && \
    npm cache clean --force

# Dev stage with source code for docker-compose
FROM base AS dev
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client and build
RUN npx prisma generate && npm run build

# Production image: root-owned app files, one writable path, no npm install
FROM base AS runner
WORKDIR /app

# The commit /api/metrics reports in build_info (docker-publish passes it)
ARG BUILD_COMMIT=unknown
ENV BUILD_COMMIT=$BUILD_COMMIT

# NEXT_MANUAL_SIG_HANDLE: the app's shutdown coordinator handles SIGTERM and
# drains jobs and the Discord bot; Next's own handler would exit at once.
# REWIND_CACHE_DIR is the only path the app may write (posters, cards, fonts).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_MANUAL_SIG_HANDLE=true \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    REWIND_CACHE_DIR=/app/.next/cache/rewind

# tini is PID 1: it forwards SIGTERM to Node and reaps zombies. The runner
# installs nothing at runtime, so the base image's npm, npx, corepack and yarn
# (and the advisories in their bundled packages) go.
# hadolint ignore=DL3018
RUN apk add --no-cache tini && \
    rm -rf /usr/local/lib/node_modules /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# The Next.js standalone output, owned by root so the app cannot rewrite its
# own code. `npm run build`'s postbuild (scripts/copy-standalone-assets.mjs)
# has already copied .next/static and public into it.
# https://nextjs.org/docs/app/api-reference/config/next-config-js/output
COPY --from=builder /app/.next/standalone ./

# Prisma schema, migrations, config and generated client, and the pinned CLI
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma/migrations ./prisma/migrations
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/lib/generated/prisma ./lib/generated/prisma
COPY --from=prisma-cli /opt/prisma-cli /opt/prisma-cli

COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

# The one writable path: Next's own cache (images, data cache) and Rewind's.
RUN mkdir -p .next/cache/rewind && \
    chown -R nextjs:nodejs .next/cache

USER nextjs

EXPOSE 3000

# Liveness only: a Redis outage, which the site survives (P4.2), must never get
# the container marked unhealthy and restarted. /api/health without the probe
# reports the database and Redis for monitoring.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health?probe=live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# server.js is created by next build from the standalone output
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]
