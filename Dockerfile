# ========================================
# AION - Multi-Stage Production Dockerfile
# Optimized for Google Cloud Run & AWS Fargate
# ========================================

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for Vite, TypeScript, etc.)
RUN npm ci

# Copy source code
COPY . .

# Build frontend (Vite)
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including dev for TypeScript compilation)
RUN npm ci

# Copy server source AND deployment (needed for multi-cloud-sync)
COPY server ./server
COPY shared ./shared
COPY training ./training
COPY db ./db
COPY deployment ./deployment

# Compile TypeScript to JavaScript
RUN npx tsc --project tsconfig.json

# Stage 3: Production runtime
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled backend from builder
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend from frontend-builder
COPY --from=frontend-builder /app/dist/public ./dist/public

# Copy deployment module (needed at runtime for multi-cloud-sync)
COPY --from=backend-builder /app/deployment ./deployment

# Copy necessary files
COPY drizzle ./drizzle

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port (Cloud Run expects 8080 by default, but we use 5000)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Start application
CMD ["node", "dist/index.js"]
