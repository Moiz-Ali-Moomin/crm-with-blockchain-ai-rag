# ─────────────────────────────────────────
# Base image
# ─────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

# ─────────────────────────────────────────
# Dependencies
# ─────────────────────────────────────────
FROM base AS deps

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json package-lock.json ./
RUN npm ci

# ─────────────────────────────────────────
# Builder
# ─────────────────────────────────────────
FROM base AS builder

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY nest-cli.json tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────
# Runner
# ─────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
ENV PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm rebuild

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs \
    && mkdir -p /app/logs \
    && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

# Optional healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health/live || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]  