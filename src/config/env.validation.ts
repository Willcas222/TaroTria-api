import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['local', 'test', 'staging', 'production'])
      .default('local'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z
      .string()
      .min(1, 'APP_URL is required')
      .url('APP_URL must be a valid URL'),
    API_URL: z
      .string()
      .min(1, 'API_URL is required')
      .url('API_URL must be a valid URL'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    DAILY_CARD_SECRET: z
      .string()
      .min(32, 'DAILY_CARD_SECRET must be at least 32 characters'),
    // Secreto compartido del proveedor de publicidad "stub" (pruebas
    // locales/CI, sin proveedor real todavía -- ver StubAdCallbackVerifier).
    REWARDS_STUB_SECRET: z
      .string()
      .min(16, 'REWARDS_STUB_SECRET must be at least 16 characters'),
    OPENAI_API_KEY: z
      .string()
      .min(20, 'OPENAI_API_KEY must be a valid OpenAI API key'),
    OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .regex(
        /^postgresql:\/\//,
        'DATABASE_URL must be a postgresql:// connection string',
      ),
    DATABASE_URL_TEST: z
      .string()
      .regex(
        /^postgresql:\/\//,
        'DATABASE_URL_TEST must be a postgresql:// connection string',
      )
      .optional(),
    REDIS_URL: z
      .string()
      .min(1, 'REDIS_URL is required')
      .regex(/^redis:\/\//, 'REDIS_URL must be a redis:// connection string'),
    REDIS_URL_TEST: z
      .string()
      .regex(
        /^redis:\/\//,
        'REDIS_URL_TEST must be a redis:// connection string',
      )
      .optional(),
    SPACES_ENDPOINT: z
      .string()
      .min(1, 'SPACES_ENDPOINT is required')
      .url('SPACES_ENDPOINT must be a valid URL'),
    SPACES_REGION: z.string().min(1).default('us-east-1'),
    SPACES_BUCKET: z.string().min(1, 'SPACES_BUCKET is required'),
    SPACES_ACCESS_KEY: z.string().min(1, 'SPACES_ACCESS_KEY is required'),
    SPACES_SECRET_KEY: z.string().min(1, 'SPACES_SECRET_KEY is required'),
    PALM_IMAGE_MAX_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    PALM_IMAGE_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
    WALLET_INITIAL_BONUS_CREDITS: z.coerce.number().int().min(0).default(10),
    WOMPI_PUBLIC_KEY: z
      .string()
      .min(1, 'WOMPI_PUBLIC_KEY is required')
      .regex(/^pub_/, 'WOMPI_PUBLIC_KEY must start with "pub_"'),
    WOMPI_PRIVATE_KEY: z
      .string()
      .min(1, 'WOMPI_PRIVATE_KEY is required')
      .regex(/^prv_/, 'WOMPI_PRIVATE_KEY must start with "prv_"'),
    WOMPI_EVENTS_SECRET: z.string().min(1, 'WOMPI_EVENTS_SECRET is required'),
    // No forma parte de la lista de variables de la sección 19 del plan,
    // pero Wompi la exige para firmar el Web Checkout (distinto del secreto
    // de eventos, que solo firma los webhooks entrantes) — sin ella, el
    // checkout hospedado rechaza la transacción por firma inválida.
    WOMPI_INTEGRITY_SECRET: z
      .string()
      .min(1, 'WOMPI_INTEGRITY_SECRET is required'),
    WOMPI_API_URL: z.string().url().default('https://sandbox.wompi.co/v1'),
    // Tasa aproximada para convertir el costo estimado de IA (siempre en
    // USD, cobrado así por el proveedor) a COP y poder mostrar un margen
    // en el dashboard admin (sección 22: "IA y margen"). Es una estimación
    // ajustable por variable de entorno, no una tasa de cambio real de
    // pagos — nunca se usa para mover dinero, solo para el reporte.
    AI_COST_USD_TO_COP_RATE: z.coerce.number().positive().default(4000),
    // Opcional a propósito: sin ella, Sentry.init() se ejecuta igual (ver
    // src/instrument.ts) pero el SDK queda inactivo y no envía eventos. Se
    // activa por completo el día que exista una cuenta y un DSN reales,
    // sin tocar código.
    SENTRY_DSN: z
      .string()
      .url('SENTRY_DSN must be a valid URL')
      .optional()
      .or(z.literal(''))
      .transform((value) => (value ? value : undefined)),
    // Igual que SENTRY_DSN: opcional a propósito. Sin ella, NotificationsModule
    // usa ConsoleNotificationsProvider (solo registra en log, no envía nada de
    // verdad) — ver notifications.module.ts. Con ella, usa Resend de verdad.
    RESEND_API_KEY: z
      .string()
      .optional()
      .or(z.literal(''))
      .transform((value) => (value ? value : undefined)),
    EMAIL_FROM: z
      .string()
      .min(1, 'EMAIL_FROM is required')
      .default('TAROTRIA <onboarding@resend.dev>'),
  })
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine((data) => data.DAILY_CARD_SECRET !== data.JWT_ACCESS_SECRET, {
    message: 'DAILY_CARD_SECRET must be different from JWT_ACCESS_SECRET',
    path: ['DAILY_CARD_SECRET'],
  })
  .refine((data) => data.DAILY_CARD_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'DAILY_CARD_SECRET must be different from JWT_REFRESH_SECRET',
    path: ['DAILY_CARD_SECRET'],
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}
