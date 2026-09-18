# Imagen de producción para la API y el worker (mismo build, distinto CMD
# vía docker-compose) -- basada en Debian slim (no alpine) porque
# @node-rs/argon2 es un addon nativo y así evitamos problemas de musl libc.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prisma generate` no se conecta a la base de datos, pero prisma.config.ts
# exige que DATABASE_URL sea resoluble -- este valor es solo para que el
# generate no falle en el build; el valor real de producción llega en
# runtime vía env_file (docker-compose.yml), nunca se hornea en la imagen.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Node >=20.19 activa por defecto la heurística "detect-module", que rompe
# `ts-node` al ejecutar prisma/seed.ts dentro del contenedor (lo hace pasar
# por el loader ESM y falla con ERR_UNKNOWN_FILE_EXTENSION). Se desactiva
# aquí -- no afecta a `node dist/main.js`, que ya es CommonJS compilado.
ENV NODE_OPTIONS=--no-experimental-detect-module
# El motor de consultas de Prisma necesita libssl -- node:20-slim no lo trae
# instalado, y sin esto usa un fallback que puede fallar en runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
# `deps` nunca corrió `prisma generate` -- el cliente generado (motor +
# tipos) vive en node_modules/.prisma y hay que traerlo aparte desde el
# stage de build, si no @prisma/client no encuentra nada en runtime.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
# prisma.config.ts y tsconfig.json viven en la raíz (junto a package.json,
# no dentro de prisma/) -- sin copiarlos, `prisma migrate deploy`/`db seed`
# no encuentran el datasource ni la config de TypeScript y fallan aunque el
# cliente ya esté generado.
COPY prisma.config.ts tsconfig.json ./
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/main"]
