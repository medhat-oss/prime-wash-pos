# ==============================================================================
# Multi-Stage Dockerfile for Car Wash ERP & POS System
# Stage 1: Build Frontend (Vite) & Backend (TypeScript)
# Stage 2: Minimal Production Runner (Node.js Alpine)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install system build dependencies if needed
RUN apk add --no-cache python3 make g++

# Copy package descriptors first for layer caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install root backend dependencies and client frontend dependencies
RUN npm ci
RUN npm --prefix client ci

# Copy entire source code
COPY tsconfig.json ./
COPY src ./src
COPY client ./client

# Compile backend TypeScript and client React Vite bundle
RUN npm run build
RUN npm run client:build

# Remove development dependencies for smaller final image
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Production Runner
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl / wget for container health checks
RUN apk add --no-cache wget

# Create non-root system group & user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy compiled backend output, client dist, and production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Create local uploads folder with appropriate permissions
RUN mkdir -p /app/uploads/media && chown -R appuser:appgroup /app/uploads

# Switch to non-root user
USER appuser

# Expose HTTP port
EXPOSE 3000

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start the application server
CMD ["node", "dist/server.js"]
