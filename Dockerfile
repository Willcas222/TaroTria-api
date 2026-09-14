# Imagen de producción para la API y el worker (mismo build, distinto CMD
# vía docker-compose) -- basada en Debian slim (no alpine) porque
# @node-rs/argon2 es un addon nativo y así evitamos problemas de musl libc.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/main"]
