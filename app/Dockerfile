# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src

# Stage 2: Production
FROM node:20-alpine

ENV NODE_ENV=production

RUN addgroup -g 1001 appuser && \
    adduser -u 1001 -G appuser -s /sbin/nologin -D appuser

WORKDIR /app

# Upgrade OS packages and global npm to patch bundled vulnerabilities (e.g. tar, minimatch)
RUN apk upgrade --no-cache && \
    npm install -g npm@latest

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/src ./src

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
