#!/bin/sh
# Production startup. One image, two roles (ADR 0001) — which one this
# container plays is an env var, not a different start command, because a
# host's "custom start command" typically overrides CMD, not a hardcoded
# ENTRYPOINT like this one. Branching in here instead works identically on
# every host (Railway, Fly, ECS, plain `docker run`) with nothing more than
# one env var, rather than depending on each platform's override semantics.
set -e

if [ "${PROCESS_ROLE:-app}" = "worker" ]; then
  echo "[start] starting background worker..."
  exec ./node_modules/.bin/tsx --conditions=react-server worker/index.ts
fi

# Deliberately does NOT run the seed script — seeding is a one-time, explicit
# step (see README / db:seed), never an automatic side effect of starting the
# container. Migrations are the app's job, not the worker's: exactly one
# process should ever run `migrate deploy` (ADR 0001).
echo "[start] running pending Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

echo "[start] starting Basilissa feedback server on port ${PORT:-3000}..."
exec node server.js
