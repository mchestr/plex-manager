#!/bin/sh
set -e

# The Prisma CLI command: the image's pinned CLI (docker/prisma-cli). Unquoted
# below on purpose, so a value such as `npx prisma` splits into its words;
# tests point it at a stub.
PRISMA_BIN="${PRISMA_BIN:-/opt/prisma-cli/node_modules/.bin/prisma}"

# prisma.config.ts imports dotenv/config and prisma/config, which the standalone
# output's node_modules does not hold, so the CLI resolves them from its own
# folder. Only the CLI gets this path: the app never falls back to it.
PRISMA_NODE_PATH="${PRISMA_NODE_PATH:-/opt/prisma-cli/node_modules}"

# Pre-flight: log what is about to be applied. `migrate status` exits non-zero
# when migrations are pending or the database is unreachable, which must never
# stop the start on its own.
echo "Checking migration status..."
# shellcheck disable=SC2086
NODE_PATH="$PRISMA_NODE_PATH" $PRISMA_BIN migrate status || true

if [ "$SKIP_MIGRATIONS" = "true" ]; then
  echo "SKIP_MIGRATIONS=true: not applying migrations"
else
  echo "Running Prisma migrations..."
  # shellcheck disable=SC2086
  NODE_PATH="$PRISMA_NODE_PATH" $PRISMA_BIN migrate deploy
fi

echo "Starting application..."
exec "$@"
