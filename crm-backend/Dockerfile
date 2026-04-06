FROM node:20-alpine AS base
WORKDIR /app

# Prisma needs OpenSSL on Alpine, and libc compatibility avoids native edge cases.
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps

# Prevent Prisma from trying to generate during npm install.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY nest-cli.json tsconfig.json ./
COPY src ./src

# Generate Prisma client and engines once at build time, then compile the app.
RUN npx prisma generate
RUN npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Copy the generated Prisma client + engines from the build stage so runtime never downloads them.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Run as a non-root user, but ensure the app directory remains readable/writable for Prisma/runtime needs.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs \
    && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
