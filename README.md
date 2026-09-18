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

- ** nitarias** (`npm test`): no requieren infraestructura externa.
- **E2E** (`npm run test:e2e`): levantan la aplicación completa vía Nest Testing; requieren PostgreSQL y Redis corriendo (`npm run docker:up`).
- **Integración** (`npm run test:integration`): corren contra una base de datos y un logical DB de Redis aislados, aplicando migraciones automáticamente antes de ejecutar.

## Probar pagos de Wompi en local

El checkout de Wompi (`checkout.wompi.co`) rechaza con un 403 genérico
cualquier `redirect-url` que contenga literalmente `localhost` o
`127.0.0.1` (protección anti-SSRF de su WAF/CloudFront). Por eso `APP_URL`
y `NEXT_PUBLIC_API_URL` usan **`lvh.me`** — un dominio público real que
resuelve a `127.0.0.1` — en vez de `localhost`. Funciona exactamente igual
que `localhost` para todo lo demás (misma máquina, mismo puerto), así que
no hay ninguna desventaja en dejarlo así permanentemente.

Con eso ya alcanza para navegar la app (`http://lvh.me:3001`) y ver que el
checkout de Wompi cargue correctamente. Para probar el ciclo **completo**
(pago → webhook → créditos acreditados) hace falta además que Wompi pueda
llamar a tu máquina desde internet, lo cual solo es necesario para el
webhook:

1. En VS Code, abre el panel **PORTS** (`Ctrl+Shift+P` → "Ports: Focus on
   Ports View").
2. Reenvía el puerto `3000` (la API) y cambia su visibilidad a **Public**
   (click derecho → Port Visibility → Public). Copia la URL que te da
   (`https://xxxx-3000.<region>.devtunnels.ms`).
3. En el panel de comercio de Wompi (**modo Sandbox**, no Producción — son
   configuraciones independientes), ve a **Mi Cuenta → URL de Eventos** y
   pega `<esa-url>/api/v1/webhooks/wompi`.
4. Si algo no llega, el panel de Wompi tiene un **Debugger** que muestra el
   cuerpo y la respuesta exacta de cada intento de entrega.

La URL del túnel cambia si cierras VS Code o quitas el reenvío del
puerto — cuando eso pase, hay que repetir los pasos 2-3 con la nueva URL.

Tarjeta de prueba para sandbox: `4242 4242 4242 4242` (aprobada) /
`4111 1111 1111 1111` (declinada), cualquier fecha futura y CVC de 3
dígitos.

## CI

`.github/workflows/ci.yml` ejecuta en cada PR y push a `main`: instalación reproducible, lint, typecheck, validación de esquema Prisma, migraciones, las tres suites de pruebas, build y un escaneo de vulnerabilidades (informativo, no bloqueante).
