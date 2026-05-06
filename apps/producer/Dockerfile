FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/producer/package.json ./apps/producer/
COPY shared/package.json ./shared/

RUN npm ci

COPY apps/producer/ ./apps/producer/
COPY shared/ ./shared/

RUN npm run build -w shared
RUN npm run build -w apps/producer

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/apps/producer/dist/apps/producer/src ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
