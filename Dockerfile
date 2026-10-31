FROM node:20-alpine AS builder

WORKDIR /app

# Copy server dependency manifests
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy source code and build
COPY server/ ./server/
COPY legacy_inventory.json ./
RUN cd server && npx prisma generate && npm run build

# Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/legacy_inventory.json ./
COPY client/ ./client/

EXPOSE 4000

CMD ["sh", "-c", "cd server && npx prisma db push && node dist/server.js"]
