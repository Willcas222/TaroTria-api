import { readFileSync } from 'fs';
import { join } from 'path';
import { registerAs } from '@nestjs/config';

function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf-8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export default registerAs('app', () => ({
  environment: process.env.NODE_ENV ?? 'local',
  port: parseInt(process.env.PORT ?? '3000', 10),
  url: process.env.APP_URL,
  apiUrl: process.env.API_URL,
  apiPrefix: 'api/v1',
  // Solo hace falta cuando la API y el frontend viven en subdominios
  // distintos del mismo dominio (ej. api.tarotria.com y tarotria.com) --
  // sin esto, una cookie puesta por la API nunca la ve el frontend, porque
  // por defecto una cookie solo es visible para el host exacto que la puso.
  // En local (mismo host lvh.me para ambos) se deja sin definir.
  cookieDomain: process.env.COOKIE_DOMAIN,
  version: readPackageVersion(),
}));
