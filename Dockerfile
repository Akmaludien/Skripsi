# Dockerfile for STMKG Monitoring System
# Base: Python 3.11 (native TF support) + Node.js 22

FROM python:3.11-slim AS base

# Install Node.js 22 + system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Node.js dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Ensure data directory exists and seed database
RUN mkdir -p /app/data && node database/seed.js

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_CMD=python3

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
    CMD curl -f http://localhost:3001/api/stations || exit 1

# Start server
CMD ["node", "src/server.js"]
