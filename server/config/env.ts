import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().int().positive()).default('5000'),
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.string().optional(),
  RATE_LIMIT_PER_HOUR: z.string().optional(),
  RATE_LIMIT_PER_DAY: z.string().optional(),
  RATE_LIMIT_TOKENS: z.string().optional(),
  ADMIN_ALLOWED_SUBS: z.string().optional(),
  DISABLE_API_KEY_AUTH: z.string().optional(),
  SYSTEM_API_KEY: z.string().optional(),
  REPLIT_DOMAINS: z.string().optional(),
  REPLIT_DEV_DOMAIN: z.string().optional(),
  REPL_SLUG: z.string().optional(),
  REPL_OWNER: z.string().optional(),
  VIDEO_WORKER_URL: z.string().url().optional(),
  VECTOR_SNAPSHOT_PATH: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
});

type Env = z.infer<typeof envSchema>;

let validatedEnv: Env;

export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid environment variables');
  }
  
  validatedEnv = result.data;
  console.log('✅ Environment variables validated');
  return validatedEnv;
}

export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}
