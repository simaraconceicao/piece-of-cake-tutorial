# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Inject production API base URL env var (if needed, but relative requests work out of the box!)
ENV VITE_API_URL=""
RUN npm run build

# --- Stage 2: Build Backend ---
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# --- Stage 3: Production Runner ---
FROM node:20-alpine AS runner
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=8080

# Copy backend built files and dependencies
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy frontend built static files to matching relative path
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
