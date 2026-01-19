# Multi-stage build for frontend and backend

# Frontend build
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/index.html frontend/tsconfig.json* frontend/vite.config.ts* ./frontend/
RUN cd frontend && npm ci || npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Backend build
FROM node:20-alpine AS backend
WORKDIR /app
COPY backend/package.json backend/tsconfig.json ./backend/
RUN cd backend && npm ci || npm install
COPY backend/ ./backend/
RUN cd backend && npm run build

# Runtime image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# create non-root user
RUN addgroup -S app && adduser -S app -G app
# Ensure data dir exists and is owned by app user
RUN mkdir -p /app/data && chown app:app /app/data
USER app

# Copy built artifacts
COPY --from=frontend /app/frontend/dist ./public
COPY --from=backend /app/backend/dist ./backend/dist
COPY --from=backend /app/backend/node_modules ./backend/node_modules

ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
