import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z
    .url()
    .refine((v) => /^postgres(ql)?:/.test(v), 'PostgreSQL URL required'),
  TEST_DATABASE_URL: z
    .url()
    .refine((v) => /^postgres(ql)?:/.test(v), 'PostgreSQL URL required')
    .optional(),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(env);
  if (
    config.NODE_ENV === 'test' &&
    (!config.TEST_DATABASE_URL ||
      new URL(config.TEST_DATABASE_URL).pathname ===
        new URL(config.DATABASE_URL).pathname)
  )
    throw new Error('Tests require a separate TEST_DATABASE_URL');
  return {
    ...config,
    databaseUrl:
      config.NODE_ENV === 'test'
        ? config.TEST_DATABASE_URL!
        : config.DATABASE_URL,
  };
}
