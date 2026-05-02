# Stage 1: Install dependencies
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir pdfplumber --break-system-packages
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production runner
FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    && rm -rf /var/lib/apt/lists/*
# pdfplumber is required for the table extraction logic in lib/slo/table-extractor.ts
RUN pip3 install --no-cache-dir pdfplumber --break-system-packages

WORKDIR /app
ENV NODE_ENV=production

# Next.js 15 requires several files for production runtime
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
