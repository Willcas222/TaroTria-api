process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://oracle:oracle@localhost:5432/oracle_api?schema=public';

process.env.DATABASE_URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://oracle:oracle@localhost:5432/oracle_api_test?schema=public';

process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0';

process.env.REDIS_URL_TEST =
  process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/1';

process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:3001';

process.env.API_URL = process.env.API_URL ?? 'http://localhost:3000/api/v1';

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ??
  'test-only-access-secret-please-change-32chars';

process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ??
  'test-only-refresh-secret-please-change-32chr';

process.env.DAILY_CARD_SECRET =
  process.env.DAILY_CARD_SECRET ??
  'test-only-daily-card-secret-please-change-32c';

process.env.OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ?? 'sk-test-dummy-key-never-called-in-tests';

process.env.SPACES_ENDPOINT =
  process.env.SPACES_ENDPOINT ?? 'http://localhost:9000';

process.env.SPACES_BUCKET =
  process.env.SPACES_BUCKET ?? 'oracle-palm-images-test';

process.env.SPACES_ACCESS_KEY = process.env.SPACES_ACCESS_KEY ?? 'oracle-minio';

process.env.SPACES_SECRET_KEY =
  process.env.SPACES_SECRET_KEY ?? 'oracle-minio-secret';

process.env.WOMPI_PUBLIC_KEY =
  process.env.WOMPI_PUBLIC_KEY ?? 'pub_test_dummy_key_never_called_in_tests';

process.env.WOMPI_PRIVATE_KEY =
  process.env.WOMPI_PRIVATE_KEY ?? 'prv_test_dummy_key_never_called_in_tests';

process.env.WOMPI_EVENTS_SECRET =
  process.env.WOMPI_EVENTS_SECRET ?? 'test-only-events-secret';

process.env.WOMPI_INTEGRITY_SECRET =
  process.env.WOMPI_INTEGRITY_SECRET ?? 'test-only-integrity-secret';
