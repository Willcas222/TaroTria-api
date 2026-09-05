# oracle-api

API backend del MVP de la plataforma de lecturas con IA (tarot y lectura de manos). Construida con [NestJS](https://nestjs.com/), PostgreSQL/Prisma y Redis/BullMQ.

Ver [`PLAN_TECNICO_MVP_ORACULO_IA.md`](./PLAN_TECNICO_MVP_ORACULO_IA.md) para el plan técnico completo, el modelo de datos, la arquitectura y el registro de avance por historia.

El frontend vive en un repositorio independiente: `oracle-web`.

## Requisitos

- Node.js 22+
- npm 10+
- Docker Desktop (para PostgreSQL y Redis en local)

## Instalación

```bash
npm install
cp .env.example .env

# Levanta PostgreSQL y Redis
npm run docker:up

# Genera el cliente de Prisma y aplica migraciones
npm run db:generate
npm run db:migrate:dev

# Datos de ejemplo (solo en NODE_ENV=local)
npm run db:seed
```

La API queda disponible en `http://localhost:3000/api/v1`, con documentación Swagger en `http://localhost:3000/docs` (deshabilitada en `production`).

## Arquitectura

- **API** (`src/main.ts` → `dist/main.js`): expone el REST API.
- **Worker** (`src/worker.ts` → `dist/worker.js`): procesa colas de BullMQ. Es un proceso independiente — nunca corre junto a la API, para poder escalarlos por separado.
- Ambos comparten configuración, logging y acceso a datos vía `src/core/core.module.ts`.

```bash
# Terminal 1: API
npm run start:dev

# Terminal 2: worker
npm run start:worker:dev
```

## Comandos

| Comando | Descripción |
|---|---|
| `npm run start:dev` | API en modo desarrollo (watch) |
| `npm run start:worker:dev` | Worker en modo desarrollo (watch) |
| `npm run build` | Compila API y worker a `dist/` |
| `npm run start:prod` / `start:worker:prod` | Ejecuta el build compilado |
| `npm run lint` | ESLint con `--fix` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Pruebas unitarias (Jest) |
| `npm run test:e2e` | Pruebas end-to-end (requiere Postgres/Redis corriendo) |
| `npm run test:integration` | Pruebas de integración contra bases de datos aisladas (`oracle_api_test`, Redis db 1) |
| `npm run docker:up` / `docker:down` | Levanta/baja PostgreSQL y Redis locales |
| `npm run db:migrate:dev` | Crea y aplica una migración de Prisma |
| `npm run db:migrate:deploy` | Aplica migraciones existentes (uso en CI/producción) |
| `npm run db:seed` | Ejecuta el seed idempotente (solo `NODE_ENV=local`) |

## Variables de entorno

Ver [`.env.example`](./.env.example) para la lista completa. La configuración se valida con Zod al arrancar (`src/config/env.validation.ts`): la aplicación falla rápido si falta una variable requerida o tiene un formato inválido. No se versionan archivos `.env` reales.

## Pruebas

Tres niveles, alineados con la sección 20 del plan técnico:

- **Unitarias** (`npm test`): no requieren infraestructura externa.
- **E2E** (`npm run test:e2e`): levantan la aplicación completa vía Nest Testing; requieren PostgreSQL y Redis corriendo (`npm run docker:up`).
- **Integración** (`npm run test:integration`): corren contra una base de datos y un logical DB de Redis aislados, aplicando migraciones automáticamente antes de ejecutar.

## CI

`.github/workflows/ci.yml` ejecuta en cada PR y push a `main`: instalación reproducible, lint, typecheck, validación de esquema Prisma, migraciones, las tres suites de pruebas, build y un escaneo de vulnerabilidades (informativo, no bloqueante).
