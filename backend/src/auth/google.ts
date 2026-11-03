/**
 * Google sign-in (UC-001, BR-070): authorization code flow with PKCE and a state cookie.
 * The ID token is verified server-side (signature, audience, expiry) by google-auth-library,
 * then checked against AUTH_ALLOWED_DOMAIN and the partner list.
 */
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { AppConfig } from '../config.js';
import { isAllowedEmail, isExtraAllowedEmail, type AllowedEmailConfig } from './allowedEmail.js';

/** The verified claims we rely on (subset of Google's ID token payload). */
export interface VerifiedGoogleIdentity {
  email?: string;
  email_verified?: boolean;
  hd?: string;
}

export interface GoogleAuthClient {
  createAuthRequest(): Promise<{ url: string; state: string; codeVerifier: string }>;
  /** Exchange the code and return the *verified* ID token payload. Throws on any failure. */
  exchangeCode(code: string, codeVerifier: string): Promise<VerifiedGoogleIdentity>;
}

export type IdentityCheck =
  | { ok: true; email: string }
  | { ok: false; error: 'WRONG_DOMAIN' | 'SIGN_IN_FAILED' };

/**
 * Pure allow-list check on a verified token payload. The email must be verified by Google and be
 * allowed (`isAllowedEmail`: in AUTH_ALLOWED_DOMAIN or listed in AUTH_EXTRA_ALLOWED_EMAILS). For a
 * domain match, a Workspace domain reported by Google (`hd`) must match too; an exact listed
 * address is accepted whatever its `hd` (it may be a consumer or another organisation's account).
 */
export function checkGoogleIdentity(identity: VerifiedGoogleIdentity, config: AllowedEmailConfig): IdentityCheck {
  const email = identity.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return { ok: false, error: 'SIGN_IN_FAILED' };
  if (!isAllowedEmail(config, email)) return { ok: false, error: 'WRONG_DOMAIN' };
  if (identity.email_verified !== true) return { ok: false, error: 'WRONG_DOMAIN' };
  if (!isExtraAllowedEmail(config, email)) {
    const allowed = config.authAllowedDomain.trim().toLowerCase();
    if (identity.hd !== undefined && identity.hd.toLowerCase() !== allowed) return { ok: false, error: 'WRONG_DOMAIN' };
  }
  return { ok: true, email };
}

export function createGoogleAuthClient(config: AppConfig): GoogleAuthClient {
  const { clientId, clientSecret, redirectUrl } = config.google;
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri: redirectUrl });
  return {
    async createAuthRequest() {
      if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
      const state = crypto.randomUUID();
      const url = client.generateAuthUrl({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        state,
        // The hd hint narrows Google's account chooser to the domain; leave it out when extra
        // addresses outside the domain are allowed (the server-side check still applies).
        hd: config.authExtraAllowedEmails.length > 0 ? undefined : config.authAllowedDomain,
        prompt: 'select_account',
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: codeChallenge,
      });
      return { url, state, codeVerifier };
    },
    async exchangeCode(code, codeVerifier) {
      const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUrl });
      if (!tokens.id_token) throw new Error('Google response did not include an ID token');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Empty ID token payload');
      return { email: payload.email, email_verified: payload.email_verified, hd: payload.hd };
    },
  };
}
