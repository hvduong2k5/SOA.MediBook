import { z } from 'zod';

const envSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .url()
    .default('http://localhost:8080')
    .transform((url) => url.replace(/\/+$/, '')),
  VITE_USE_MOCK: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
  VITE_SSE_URL: z
    .string()
    .url()
    .default('http://localhost:8080/api/v1/realtime/stream'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, unknown>): AppEnv {
  return envSchema.parse({
    VITE_API_BASE_URL: raw.VITE_API_BASE_URL || undefined,
    VITE_USE_MOCK: raw.VITE_USE_MOCK || undefined,
    VITE_SSE_URL: raw.VITE_SSE_URL || undefined,
  });
}

export const env: AppEnv = parseEnv(import.meta.env);
