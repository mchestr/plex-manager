#!/bin/sh
set -e

# Ensure /data directory exists (SQLite needs parent directory to exist)
mkdir -p /data

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec "$@"
