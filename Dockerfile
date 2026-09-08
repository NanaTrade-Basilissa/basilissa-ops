# syntax=docker/dockerfile:1
#
# Multi-stage production build for the Basilissa feedback system.
#   deps    -> install all dependencies (needed to build)
#   builder -> `next build` (standalone output) + generate the Prisma client
#   runner  -> minimal runtime image: standalone server + node_modules the
#              Prisma CLI needs at startup (migrate deploy / db seed), and
#              nothing else. No devDependencies, no source maps, no build
#              cache ship in the final image.
#
# No secrets are baked into any layer: build-time envs below are inert
# placeholders, real configuration is injected at `docker compose up` time
# via docker-compose.yml's `env_file`/`environment`.

ARG NODE_VERSION=22-slim

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

RUN npm install -g pnpm@10.28.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

RUN npm install -g pnpm@10.28.0

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time-only placeholders. NEXT_PUBLIC_APP_URL only affects a couple
# of client-visible strings and is not a secret; nothing here is a real
# credential, and the running container reads its actual configuration
# from the environment at request time, not from these build args.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000

RUN pnpm build

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# openssl + ca-certificates: required by Prisma's query engine and by
# outbound HTTPS calls (Resend). pnpm: only `docker compose exec app pnpm
# prisma db seed` needs it — the app itself runs via plain `node`.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.28.0

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Next.js's standalone output: a self-contained server.js plus a
# dependency-traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Belt-and-suspenders for Prisma: the `prisma`/`tsx` CLIs (needed for
# `prisma migrate deploy` at startup and `prisma db seed`) are invoked
# dynamically rather than statically imported, so Next's dependency tracer
# misses them and their transitive deps (e.g. @prisma/config -> c12 ->
# effect -> ... — a deep, version-shifting tree). Copying the whole
# builder node_modules — safe and cheap with this project's flat, hoisted
# layout (see .npmrc) — guarantees everything the CLI needs is present
# instead of hand-listing an every-version-bump-fragile package list.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
# Required, not optional: the Prisma CLI reads its schema path and its seed
# command from here now that package.json#prisma is gone (deprecated, removed
# in Prisma 7). Without this file `prisma migrate deploy` in start.sh and
# `prisma db seed` in the compose `seed` service both lose their configuration.
# It loads no .env* file in the container — none ship in the image — so the
# environment supplied by compose/hosting is used as-is.
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
# The worker runs from this same image with a different command
# (`docker compose up worker`, or `pnpm worker`). Shipping one image keeps the
# web app and the worker on identical code — a worker running older domain
# logic than the app that enqueued the job is a subtle and unpleasant bug.
COPY --from=builder --chown=nextjs:nodejs /app/worker ./worker
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --chown=nextjs:nodejs docker/start.sh ./start.sh

RUN chmod +x ./start.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./start.sh"]
