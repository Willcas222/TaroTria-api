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
  version: readPackageVersion(),
}));
