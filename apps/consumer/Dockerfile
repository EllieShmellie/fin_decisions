FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/consumer/package.json ./apps/consumer/
COPY shared/package.json ./shared/

RUN npm ci

COPY apps/consumer/ ./apps/consumer/
COPY shared/ ./shared/

RUN npm run build -w shared
RUN npm run build -w apps/consumer

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/apps/consumer/dist/apps/consumer/src ./dist
COPY --from=builder /app/node_modules ./node_modules

CMD ["node", "dist/main.js"]
