import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URL: z.string().default('http://localhost:3000/api/auth/google/callback'),
  AUTH_ALLOWED_DOMAIN: z.string().min(1),
  DEV_LOGIN_ENABLED: booleanString,
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().min(1).default('../../instaglamour-uploads'),
});

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  sessionSecret: string;
  google: { clientId: string; clientSecret: string; redirectUrl: string };
  authAllowedDomain: string;
  devLoginEnabled: boolean;
  frontendUrl: string;
  uploadDir: string;
  /** Send cookies with the Secure flag (only when served over https). */
  secureCookies: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  const frontendUrl = e.FRONTEND_URL.replace(/\/+$/, '');
  return {
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    google: {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      redirectUrl: e.GOOGLE_REDIRECT_URL,
    },
    authAllowedDomain: e.AUTH_ALLOWED_DOMAIN.trim().toLowerCase(),
    devLoginEnabled: e.DEV_LOGIN_ENABLED,
    frontendUrl,
    uploadDir: e.UPLOAD_DIR,
    secureCookies: frontendUrl.startsWith('https://'),
  };
}
