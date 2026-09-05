import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup(): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_URL_TEST ??
    'postgresql://oracle:oracle@localhost:5432/oracle_api_test?schema=public';

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
