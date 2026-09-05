// Debe importarse antes que cualquier otro módulo (primera línea de main.ts
// y worker.ts): Sentry instrumenta automáticamente el resto de imports al
// inicializarse. Sin SENTRY_DSN, el SDK queda inicializado pero no envía
// eventos — así el código de captura queda listo sin depender de tener ya
// una cuenta de Sentry.
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'local',
  tracesSampleRate: process.env.SENTRY_DSN ? 0.2 : 0,
});
