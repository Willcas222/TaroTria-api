import { validateEnv } from './env.validation';

const DATABASE_URL = 'postgresql://oracle:oracle@localhost:5432/oracle_api';
const REDIS_URL = 'redis://localhost:6379/0';
const APP_URL = 'http://localhost:3001';
const API_URL = 'http://localhost:3000/api/v1';
const JWT_ACCESS_SECRET = 'test-only-access-secret-please-change-32chars';
const JWT_REFRESH_SECRET = 'test-only-refresh-secret-please-change-32chr';
const DAILY_CARD_SECRET = 'test-only-daily-card-secret-please-change-32c';
const REWARDS_STUB_SECRET = 'test-only-rewards-stub-secret';
const OPENAI_API_KEY = 'sk-test-dummy-key-never-called-in-tests';
const SPACES_ENDPOINT = 'http://localhost:9000';
const SPACES_BUCKET = 'oracle-palm-images-test';
const SPACES_ACCESS_KEY = 'oracle-minio';
const SPACES_SECRET_KEY = 'oracle-minio-secret';
const WOMPI_PUBLIC_KEY = 'pub_test_dummy_key';
const WOMPI_PRIVATE_KEY = 'prv_test_dummy_key';
const WOMPI_EVENTS_SECRET = 'test-only-events-secret';
const WOMPI_INTEGRITY_SECRET = 'test-only-integrity-secret';
const REQUIRED = {
  DATABASE_URL,
  REDIS_URL,
  APP_URL,
  API_URL,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  DAILY_CARD_SECRET,
  REWARDS_STUB_SECRET,
  OPENAI_API_KEY,
  SPACES_ENDPOINT,
  SPACES_BUCKET,
  SPACES_ACCESS_KEY,
  SPACES_SECRET_KEY,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_EVENTS_SECRET,
  WOMPI_INTEGRITY_SECRET,
};

describe('validateEnv', () => {
  it('applies safe defaults when only required variables are provided', () => {
    const result = validateEnv(REQUIRED);

    expect(result.NODE_ENV).toBe('local');
    expect(result.PORT).toBe(3000);
    expect(result.DATABASE_URL).toBe(DATABASE_URL);
    expect(result.REDIS_URL).toBe(REDIS_URL);
    expect(result.APP_URL).toBe(APP_URL);
    expect(result.API_URL).toBe(API_URL);
    expect(result.OPENAI_MODEL).toBe('gpt-4o-mini');
    expect(result.SPACES_REGION).toBe('us-east-1');
    expect(result.SPACES_BUCKET).toBe(SPACES_BUCKET);
    expect(result.PALM_IMAGE_MAX_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(result.PALM_IMAGE_RETENTION_HOURS).toBe(24);
    expect(result.WALLET_INITIAL_BONUS_CREDITS).toBe(10);
    expect(result.WOMPI_API_URL).toBe('https://sandbox.wompi.co/v1');
    expect(result.AI_COST_USD_TO_COP_RATE).toBe(4000);
    expect(result.SENTRY_DSN).toBeUndefined();
    expect(result.RESEND_API_KEY).toBeUndefined();
    expect(result.EMAIL_FROM).toBe('TAROTRIA <onboarding@resend.dev>');
  });

  it('treats an empty RESEND_API_KEY as not configured', () => {
    const result = validateEnv({ ...REQUIRED, RESEND_API_KEY: '' });

    expect(result.RESEND_API_KEY).toBeUndefined();
  });

  it('accepts a real RESEND_API_KEY and a custom EMAIL_FROM', () => {
    const result = validateEnv({
      ...REQUIRED,
      RESEND_API_KEY: 're_test_dummy_key',
      EMAIL_FROM: 'TAROTRIA <no-reply@tarotria.com>',
    });

    expect(result.RESEND_API_KEY).toBe('re_test_dummy_key');
    expect(result.EMAIL_FROM).toBe('TAROTRIA <no-reply@tarotria.com>');
  });

  it('treats an empty SENTRY_DSN as not configured', () => {
    const result = validateEnv({ ...REQUIRED, SENTRY_DSN: '' });

    expect(result.SENTRY_DSN).toBeUndefined();
  });

  it('accepts a valid SENTRY_DSN', () => {
    const result = validateEnv({
      ...REQUIRED,
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
    });

    expect(result.SENTRY_DSN).toBe(
      'https://examplePublicKey@o0.ingest.sentry.io/0',
    );
  });

  it('accepts a valid explicit configuration', () => {
    const result = validateEnv({
      NODE_ENV: 'staging',
      PORT: '4000',
      APP_URL: 'https://app.example.com',
      API_URL: 'https://api.example.com',
      JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET,
      DAILY_CARD_SECRET,
      REWARDS_STUB_SECRET,
      OPENAI_API_KEY,
      OPENAI_MODEL: 'gpt-4o',
      DATABASE_URL,
      DATABASE_URL_TEST: `${DATABASE_URL}_test`,
      REDIS_URL,
      REDIS_URL_TEST: 'redis://localhost:6379/1',
      SPACES_ENDPOINT,
      SPACES_REGION: 'sfo3',
      SPACES_BUCKET,
      SPACES_ACCESS_KEY,
      SPACES_SECRET_KEY,
      PALM_IMAGE_MAX_SIZE_BYTES: '5242880',
      PALM_IMAGE_RETENTION_HOURS: '12',
      WALLET_INITIAL_BONUS_CREDITS: '20',
      WOMPI_PUBLIC_KEY,
      WOMPI_PRIVATE_KEY,
      WOMPI_EVENTS_SECRET,
      WOMPI_INTEGRITY_SECRET,
      WOMPI_API_URL: 'https://production.wompi.co/v1',
      AI_COST_USD_TO_COP_RATE: '3900',
    });

    expect(result).toEqual({
      NODE_ENV: 'staging',
      PORT: 4000,
      APP_URL: 'https://app.example.com',
      API_URL: 'https://api.example.com',
      JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET,
      DAILY_CARD_SECRET,
      REWARDS_STUB_SECRET,
      OPENAI_API_KEY,
      OPENAI_MODEL: 'gpt-4o',
      DATABASE_URL,
      DATABASE_URL_TEST: `${DATABASE_URL}_test`,
      REDIS_URL,
      REDIS_URL_TEST: 'redis://localhost:6379/1',
      SPACES_ENDPOINT,
      SPACES_REGION: 'sfo3',
      SPACES_BUCKET,
      SPACES_ACCESS_KEY,
      SPACES_SECRET_KEY,
      PALM_IMAGE_MAX_SIZE_BYTES: 5242880,
      PALM_IMAGE_RETENTION_HOURS: 12,
      WALLET_INITIAL_BONUS_CREDITS: 20,
      WOMPI_PUBLIC_KEY,
      WOMPI_PRIVATE_KEY,
      WOMPI_EVENTS_SECRET,
      WOMPI_INTEGRITY_SECRET,
      WOMPI_API_URL: 'https://production.wompi.co/v1',
      AI_COST_USD_TO_COP_RATE: 3900,
      EMAIL_FROM: 'TAROTRIA <onboarding@resend.dev>',
    });
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ ...REQUIRED, DATABASE_URL: undefined })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast when DATABASE_URL is not a postgresql connection string', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when REDIS_URL is missing', () => {
    expect(() => validateEnv({ ...REQUIRED, REDIS_URL: undefined })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast when REDIS_URL is not a redis connection string', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, REDIS_URL: 'http://localhost:6379' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('accepts REDIS_URL with the TLS "rediss://" scheme used by managed Redis providers', () => {
    const result = validateEnv({
      ...REQUIRED,
      REDIS_URL: 'rediss://user:pass@managed-redis-host:25061',
    });

    expect(result.REDIS_URL).toBe(
      'rediss://user:pass@managed-redis-host:25061',
    );
  });

  it('fails fast when APP_URL is missing', () => {
    expect(() => validateEnv({ ...REQUIRED, APP_URL: undefined })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast when APP_URL is not a valid URL', () => {
    expect(() => validateEnv({ ...REQUIRED, APP_URL: 'not-a-url' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast when API_URL is missing', () => {
    expect(() => validateEnv({ ...REQUIRED, API_URL: undefined })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast when API_URL is not a valid URL', () => {
    expect(() => validateEnv({ ...REQUIRED, API_URL: 'not-a-url' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast when JWT_ACCESS_SECRET is missing or too short', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, JWT_ACCESS_SECRET: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when JWT_REFRESH_SECRET is missing or too short', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, JWT_REFRESH_SECRET: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, JWT_REFRESH_SECRET: 'too-short' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when the access and refresh secrets are identical', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, JWT_REFRESH_SECRET: JWT_ACCESS_SECRET }),
    ).toThrow(/must be different/);
  });

  it('fails fast when DAILY_CARD_SECRET is missing or too short', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, DAILY_CARD_SECRET: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, DAILY_CARD_SECRET: 'too-short' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when DAILY_CARD_SECRET matches JWT_ACCESS_SECRET', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, DAILY_CARD_SECRET: JWT_ACCESS_SECRET }),
    ).toThrow(/must be different/);
  });

  it('fails fast when DAILY_CARD_SECRET matches JWT_REFRESH_SECRET', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, DAILY_CARD_SECRET: JWT_REFRESH_SECRET }),
    ).toThrow(/must be different/);
  });

  it('fails fast when OPENAI_API_KEY is missing or too short', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, OPENAI_API_KEY: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, OPENAI_API_KEY: 'too-short' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when SPACES_ENDPOINT is missing or not a URL', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, SPACES_ENDPOINT: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, SPACES_ENDPOINT: 'not-a-url' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when SPACES_BUCKET, SPACES_ACCESS_KEY or SPACES_SECRET_KEY are missing', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, SPACES_BUCKET: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, SPACES_ACCESS_KEY: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, SPACES_SECRET_KEY: undefined }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when WOMPI_PUBLIC_KEY or WOMPI_PRIVATE_KEY have the wrong prefix', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, WOMPI_PUBLIC_KEY: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, WOMPI_PUBLIC_KEY: 'not-prefixed' }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, WOMPI_PRIVATE_KEY: 'pub_wrong_prefix' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when WOMPI_EVENTS_SECRET or WOMPI_INTEGRITY_SECRET are missing', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, WOMPI_EVENTS_SECRET: undefined }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      validateEnv({ ...REQUIRED, WOMPI_INTEGRITY_SECRET: undefined }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast on an unknown NODE_ENV value', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, NODE_ENV: 'not-a-real-env' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('fails fast when PORT is not a number', () => {
    expect(() => validateEnv({ ...REQUIRED, PORT: 'not-a-number' })).toThrow(
      /Invalid environment configuration/,
    );
  });
});
