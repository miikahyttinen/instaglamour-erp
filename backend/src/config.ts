import path from 'node:path';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

/** Default UPLOAD_DIR (relative to the working directory, i.e. backend/): outside the repository. */
export const DEFAULT_UPLOAD_DIR = '../../instaglamour-uploads';

/** Default FRONTEND_DIST_DIR (relative to the working directory, i.e. backend/): the Vite build output. */
export const DEFAULT_FRONTEND_DIST_DIR = '../frontend/dist';

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  // Default depends on NODE_ENV (see loadConfig): 0.0.0.0 in production, 127.0.0.1 otherwise.
  HOST: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URL: z.string().default('http://localhost:3000/api/auth/google/callback'),
  AUTH_ALLOWED_DOMAIN: z.string().min(1),
  AUTH_EXTRA_ALLOWED_EMAILS: z.string().optional(),
  DEV_LOGIN_ENABLED: booleanString,
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().min(1).default(DEFAULT_UPLOAD_DIR),
  FRONTEND_DIST_DIR: z.string().min(1).default(DEFAULT_FRONTEND_DIST_DIR),
});

export interface AppConfig {
  /** NODE_ENV=production. */
  production: boolean;
  port: number;
  host: string;
  databaseUrl: string;
  sessionSecret: string;
  google: { clientId: string; clientSecret: string; redirectUrl: string };
  authAllowedDomain: string;
  /**
   * AUTH_EXTRA_ALLOWED_EMAILS: exact addresses (trimmed, lower case) treated as if they were in
   * `authAllowedDomain`. Empty = no exceptions. Check with `isAllowedEmail` (auth/allowedEmail.ts).
   */
  authExtraAllowedEmails: string[];
  devLoginEnabled: boolean;
  frontendUrl: string;
  uploadDir: string;
  /** Send cookies with the Secure flag (only when served over https). */
  secureCookies: boolean;
  /**
   * Absolute path of the built frontend served by the backend with an SPA fallback (single-service
   * deployment). Set only in production; in development the Vite dev server serves the UI.
   */
  staticDir: string | null;
}

/**
 * Parse AUTH_EXTRA_ALLOWED_EMAILS: comma-separated, trimmed, lower-cased, empty entries ignored,
 * duplicates removed. Throws (startup error) on any entry that is not an email address.
 */
export function parseExtraAllowedEmails(raw: string | undefined): string[] {
  const entries = (raw ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
  const invalidCount = entries.filter((v) => !z.email().safeParse(v).success).length;
  if (invalidCount > 0) {
    throw new Error(
      `Invalid environment configuration: AUTH_EXTRA_ALLOWED_EMAILS has ${invalidCount} entr${invalidCount === 1 ? 'y' : 'ies'} that ${invalidCount === 1 ? 'is' : 'are'} not an email address.`,
    );
  }
  return [...new Set(entries)];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  const frontendUrl = e.FRONTEND_URL.replace(/\/+$/, '');

  // Fail fast on unsafe production configuration.
  if (production && e.DEV_LOGIN_ENABLED) {
    throw new Error('Unsafe configuration: DEV_LOGIN_ENABLED=true is not allowed with NODE_ENV=production.');
  }
  if (production && !frontendUrl.startsWith('https://')) {
    throw new Error('Unsafe configuration: FRONTEND_URL must be an https:// URL with NODE_ENV=production.');
  }

  return {
    production,
    port: e.PORT,
    host: e.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    google: {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      redirectUrl: e.GOOGLE_REDIRECT_URL,
    },
    authAllowedDomain: e.AUTH_ALLOWED_DOMAIN.trim().toLowerCase(),
    authExtraAllowedEmails: parseExtraAllowedEmails(e.AUTH_EXTRA_ALLOWED_EMAILS),
    devLoginEnabled: e.DEV_LOGIN_ENABLED,
    frontendUrl,
    uploadDir: e.UPLOAD_DIR,
    secureCookies: frontendUrl.startsWith('https://'),
    staticDir: production ? path.resolve(e.FRONTEND_DIST_DIR) : null,
  };
}
