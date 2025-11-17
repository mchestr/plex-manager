#!/bin/sh
set -e

echo "Running Prisma migrations..."
# Use Prisma binary directly (npx may not be available in slim image)
if [ -f "node_modules/.bin/prisma" ]; then
  node_modules/.bin/prisma migrate deploy
elif [ -f "node_modules/prisma/bin/prisma" ]; then
  node node_modules/prisma/bin/prisma migrate deploy
else
  echo "Warning: Prisma CLI not found, skipping migrations"
  echo "Continuing with application startup..."
fi

echo "Starting application..."
exec node server.js

