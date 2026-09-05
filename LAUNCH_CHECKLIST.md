# Checklist de seguridad y lanzamiento — Oráculo IA (MVP)

Última revisión: 2026-09-04. Este documento es el resultado de recorrer la
Definition of Done del MVP (sección final de `PLAN_TECNICO_MVP_ORACULO_IA.md`)
contra el estado real del código, no una lista aspiracional.

## 1. Autenticación y autorización

- [x] Contraseñas con hash (bcrypt), JWT de acceso/refresco en cookies `httpOnly`.
- [x] Guards por rol (`JwtAuthGuard`, roles admin) en todos los endpoints `/admin/*`.
- [x] Rate limiting global (100 req/min/IP) y throttles específicos más
      estrictos en login, forgot-password, webhooks y reintentos.
- [x] Verificado con navegador real: un usuario no admin recibe 403 en rutas
      `/admin/*`; sesiones cerradas no pueden acceder a rutas protegidas.
- [ ] Rotación de secretos JWT y política de expiración en producción real
      (los valores actuales son de desarrollo, deben regenerarse antes de
      desplegar).

## 2. Idempotencia de pagos y créditos

- [x] Wallet con ledger; reserva, consumo, liberación y reembolso probados
      bajo concurrencia (Fase 7).
- [x] Webhook de Wompi firmado y verificado; reintentos del webhook no
      duplican acreditación (Fase 8).
- [x] Reintento de una lectura fallida nunca vuelve a cobrar créditos —
      `retry`/`retryAsAdmin` no tocan el wallet; se apoyan en que
      `confirmConsumption`/`releaseReservation` son no-op seguros si la
      reserva ya no está `ACTIVE` (US-1003).
- [ ] Credenciales reales de sandbox/producción de Wompi (bloqueado,
      pendiente del usuario).

## 3. Retención y borrado de imágenes

- [x] Imágenes de manos en bucket privado, URL firmada de subida.
- [x] Job de eliminación tras el período de retención configurado
      (`PALM_IMAGE_RETENTION_HOURS`), con evidencia de borrado.
- [x] Documentado en la política de privacidad (`/legal/privacidad`).

## 4. Migraciones y esquema

- [x] Todas las migraciones de Prisma versionadas en `prisma/migrations`.
- [x] `db:migrate:deploy` es el comando de despliegue (no `migrate dev`).
- [ ] Prisma no genera migraciones de reversión automáticas: el plan de
      rollback ante una migración problemática en producción es restaurar
      el backup más reciente (`scripts/db-restore.sh`), no un `down`
      automático. Falta ensayar ese escenario en un entorno de staging real.

## 5. Observabilidad

- [x] Logging estructurado (pino) con redacción de headers sensibles.
- [x] Endpoints de health/readiness.
- [x] Dashboard admin de usuarios, lecturas, ventas, conversión, IA y margen.
- [x] Audit log de acciones administrativas sensibles (ajustes de wallet,
      publicación de servicios/prompts, reintentos).
- [x] Integración de Sentry lista en código (`src/instrument.ts` en
      oracle-api, `src/instrumentation.ts` / `instrumentation-client.ts` en
      oracle-web) — captura excepciones HTTP no controladas, fallos
      definitivos de jobs de BullMQ y errores de renderizado en el frontend.
- [ ] **Bloqueado**: sin `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` reales, el SDK
      está inicializado pero inactivo — no hay captura real todavía. Falta
      crear la cuenta de Sentry, configurar el DSN y las reglas de alerta
      (issue alerts / integración con Slack o correo) desde su dashboard.

## 6. Backups y restauración

- [x] `npm run db:backup` (`scripts/db-backup.sh`): `pg_dump` en formato
      custom contra el Postgres del docker-compose.
- [x] `npm run db:restore -- <archivo>` (`scripts/db-restore.sh`): restaura
      con `pg_restore --clean --if-exists`, con confirmación explícita.
- [x] Probado localmente: backup y restore ejecutados contra la base de
      desarrollo sin errores.
- [ ] Falta definir la cadencia de backups automáticos y su retención en el
      entorno de producción real (depende de dónde se despliegue — sección
      "Staging desplegable" del plan, aún pendiente).

## 7. Pruebas

- [x] Suite unitaria: 278 tests (oracle-api) + 60 tests (oracle-web).
- [x] Suite de integración contra Postgres/Redis reales: 91 tests.
- [x] E2E de Nest (supertest) para arranque y health.
- [x] E2E de navegador real (Playwright) del recorrido dorado: registro →
      sesión activa → cierre de sesión → ruta protegida bloqueada →
      reingreso (`oracle-web/e2e/golden-path.spec.ts`, `npm run test:e2e`).
- [x] Prueba de carga básica (`npm run test:load`, `scripts/load-test.sh`):
      confirma que la API sostiene concurrencia sin caerse y que el rate
      limiting global reacciona como se espera.
- [ ] No hay pruebas E2E del flujo de pago real con Wompi (bloqueado por la
      misma falta de credenciales sandbox reales del punto 2).

## 8. Variables de entorno y secretos

- [x] Validación tipada con zod (`env.validation.ts`) — el proceso no
      arranca con configuración inválida o incompleta.
- [x] `.env.example` actualizado en ambos repos, sin secretos reales.
- [ ] Ningún secreto de este repo (JWT, DAILY_CARD_SECRET, credenciales de
      Wompi) debe reutilizarse en producción; deben regenerarse al desplegar.

## 9. Textos legales y cumplimiento

- [x] Términos de servicio y política de privacidad publicados y enlazados
      desde el registro y el pie de página de toda la aplicación
      (`/legal/terminos`, `/legal/privacidad`).
- [ ] **Borrador pendiente de revisión legal real** antes de producción —
      el contenido actual es una redacción razonable para el MVP, no un
      documento validado por un abogado.

## 10. Bloqueadores reales antes de producción

1. Credenciales reales de sandbox/producción de Wompi.
2. DSN real de Sentry + reglas de alerta configuradas en su dashboard.
3. Revisión legal de los textos de términos y privacidad.
4. Despliegue de un entorno de staging real (ítem "Staging desplegable" de
   la Fase 0, aún no ejecutado — todo lo anterior se ha verificado en
   local contra infraestructura real, pero nunca en un servidor remoto).

Ninguno de estos cuatro puntos es un problema de código: son credenciales,
contenido o infraestructura que dependen de decisiones y accesos que solo
el usuario puede proveer.
