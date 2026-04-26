# Multi-stage Dockerfile for the Crawlix BullMQ worker.
# Build context MUST be the monorepo root (e.g. `docker build -f apps/worker/Dockerfile .`)
# so workspace packages under packages/* are visible.

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# ---------- Dependencies ----------
FROM base AS deps
# Install dev deps too (tsx is a runtime dep for the worker entrypoint)
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/scoring/package.json packages/scoring/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/db/prisma packages/db/prisma
RUN npm ci --include=dev

# ---------- Runtime ----------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY tsconfig.json ./tsconfig.json
COPY apps/worker apps/worker
COPY packages packages

# Generate Prisma client for runtime
RUN npx --workspace @crawlix/db prisma generate --schema=packages/db/prisma/schema.prisma

# Run as non-root for safety
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

CMD ["npm", "run", "start", "--workspace", "@crawlix/worker"]
