#!/bin/sh
set -e

# The Prisma CLI command. Unquoted below on purpose, so the default splits into
# `npx` and `prisma`; tests point it at a stub.
PRISMA_BIN="${PRISMA_BIN:-npx prisma}"

# Pre-flight: log what is about to be applied. `migrate status` exits non-zero
# when migrations are pending or the database is unreachable, which must never
# stop the start on its own.
echo "Checking migration status..."
# shellcheck disable=SC2086
$PRISMA_BIN migrate status || true

if [ "$SKIP_MIGRATIONS" = "true" ]; then
  echo "SKIP_MIGRATIONS=true: not applying migrations"
else
  echo "Running Prisma migrations..."
  # shellcheck disable=SC2086
  $PRISMA_BIN migrate deploy
fi

echo "Starting application..."
exec "$@"
