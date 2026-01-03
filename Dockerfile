# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Environment variables (with defaults where appropriate)
ENV NODE_ENV=production

# Notion Configuration
ENV NOTION_KEY=""
ENV NOTION_DATABASE_ID=""

# Typecho Database Configuration
ENV TYPECHO_DB_ADAPTER="postgresql"
ENV TYPECHO_DB_HOST="localhost"
ENV TYPECHO_DB_PORT="5432"
ENV TYPECHO_DB_USER="typecho"
ENV TYPECHO_DB_PASSWORD=""
ENV TYPECHO_DB_DATABASE="typecho"
ENV TYPECHO_DB_CHARSET="utf8"
ENV TYPECHO_DB_PREFIX="typecho_"

# Run the application
CMD ["node", "dist/index.js"]
