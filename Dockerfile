# --- Stage 1: Build Frontend ---
FROM node:24-alpine AS frontend-builder
WORKDIR /app

# Copy workspace root manifests + lockfile + workspace package.json files
COPY package*.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN npm ci -w frontend

COPY frontend/ ./frontend/
ENV VITE_API_URL=""
RUN npm run build -w frontend

# --- Stage 2: Build Backend ---
FROM node:24-alpine AS backend-builder
WORKDIR /app

COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci -w backend

COPY backend/ ./backend/
RUN npm run build -w backend

# --- Stage 3: Production Runner ---
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install only backend production dependencies
COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci -w backend --omit=dev

# Copy backend built files
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Copy frontend built static files (backend serves these at runtime)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8080

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
