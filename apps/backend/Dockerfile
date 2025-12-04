# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules

# Copy source code
COPY . .

# Build packages/types first
WORKDIR /app/packages/types
RUN pnpm build

# Build backend
WORKDIR /app/apps/backend
RUN pnpm prisma generate
RUN pnpm build

# Stage 3: Runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install production dependencies only
RUN apk add --no-cache \
    dumb-init \
    curl \
    && npm install -g pnpm@8

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/types/package.json ./packages/types/

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder --chown=nestjs:nodejs /app/packages/types/dist ./packages/types/dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

USER nestjs
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/backend/dist/main.js"]
