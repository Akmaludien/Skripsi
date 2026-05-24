# ─── Multi-stage Dockerfile for STMKG Monitoring System ───
# Stage 1: Node.js + Python (combined runtime)

FROM node:22-slim AS base

# Install Python 3.12 + system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ─── Node.js dependencies ───
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Python dependencies ───
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir tensorflow

# ─── Copy application code ───
COPY . .

# ─── Ensure data directory exists & seed database ───
RUN mkdir -p /app/data && node database/seed.js

# ─── Environment ───
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_CMD=/app/venv/bin/python3

# ─── Expose port ───
EXPOSE 3001

# ─── Health check ───
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
    CMD curl -f http://localhost:3001/api/stations || exit 1

# ─── Start server ───
CMD ["node", "server.js"]
