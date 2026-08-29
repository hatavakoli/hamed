# =============================================================================
# One image runs both processes. docker-compose just gives them different
# commands:
#   app     -> node server.js            (the Next.js dashboard + API)
#   worker  -> tsx scripts/worker.ts     (the node-cron scheduler)
# =============================================================================

# ---------- 1. Install dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
# All dependencies, including dev: the worker runs through tsx and the
# container also runs `prisma migrate deploy`, both of which are devDependencies.
RUN npm ci

# ---------- 2. Build ----------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client before Next.js type-checks the build.
RUN npx prisma generate

# DATABASE_URL is only used at runtime, but Next.js evaluates some modules while
# building. A dummy value keeps the build hermetic — no database is contacted.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
# Docker needs the standalone server bundle; see next.config.mjs.
ENV NEXT_OUTPUT_STANDALONE=true
RUN npm run build

# ---------- 3. Runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# `adduser --system` does not create a home directory; point HOME at the app dir
# so any tool that wants to write a cache has somewhere it can.
ENV HOME=/app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# `output: standalone` produces a self-contained server bundle.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy the FULL node_modules from the builder (it already contains the
# generated Prisma client). This lands on top of the small set that
# `standalone` bundles, so `prisma`, `tsx` and `node-cron` all resolve.
# It makes the image larger, but it is far less fragile than hand-picking
# individual packages — and correctness matters more than a few hundred MB here.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Needed at runtime by the worker and by `prisma migrate deploy`.
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
