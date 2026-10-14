/** Auth endpoints (docs/api-contract.md "Auth & me"). All are reachable without a session. */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { checkGoogleIdentity } from '../auth/google.js';
import { endSession, startSession } from '../auth/session.js';
import { forbidden, parseInput } from '../http/errors.js';
import { toPartnerDto } from '../serializers.js';
import type { AppDeps } from '../app.js';

const OAUTH_COOKIE = 'ig_oauth';
const OAUTH_COOKIE_TTL_S = 10 * 60;

type LoginError = 'WRONG_DOMAIN' | 'NOT_A_PARTNER' | 'SIGN_IN_FAILED';

const callbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const devLoginBody = z.object({ email: z.string().trim().min(1).max(500).email() });

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, google } = deps;

  /** BR-070 / BR-111: only an **active** partner may sign in. */
  const findPartnerByEmail = (email: string) =>
    db.partner.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, active: true },
      include: { person: true },
    });

  const redirectToLogin = (reply: FastifyReply, error: LoginError) =>
    reply.redirect(`${config.frontendUrl}/login?error=${error}`, 302);

  const clearOauthCookie = (reply: FastifyReply) =>
    reply.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google', httpOnly: true, sameSite: 'lax', secure: config.secureCookies });

  app.get('/api/auth/google/start', async (request, reply) => {
    try {
      const { url, state, codeVerifier } = await google.createAuthRequest();
      reply.setCookie(OAUTH_COOKIE, JSON.stringify({ state, codeVerifier }), {
        path: '/api/auth/google',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        signed: true,
        maxAge: OAUTH_COOKIE_TTL_S,
      });
      return reply.redirect(url, 302);
    } catch (err) {
      request.log.error({ err }, 'Could not start Google sign-in');
      return redirectToLogin(reply, 'SIGN_IN_FAILED');
    }
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    const query = callbackQuery.safeParse(request.query);
    const raw = request.cookies[OAUTH_COOKIE];
    clearOauthCookie(reply);
    if (!query.success || query.data.error || !query.data.code || !query.data.state || !raw) {
      return redirectToLogin(reply, 'SIGN_IN_FAILED');
    }

    const unsigned = request.unsignCookie(raw);
    let stored: { state?: unknown; codeVerifier?: unknown } = {};
    try {
      if (unsigned.valid && unsigned.value) stored = JSON.parse(unsigned.value) as typeof stored;
    } catch {
      stored = {};
    }
    if (typeof stored.state !== 'string' || typeof stored.codeVerifier !== 'string' || stored.state !== query.data.state) {
      return redirectToLogin(reply, 'SIGN_IN_FAILED');
    }

    let identity;
    try {
      identity = await google.exchangeCode(query.data.code, stored.codeVerifier);
    } catch (err) {
      request.log.warn({ err }, 'Google token exchange/verification failed');
      return redirectToLogin(reply, 'SIGN_IN_FAILED');
    }

    const check = checkGoogleIdentity(identity, config.authAllowedDomain);
    if (!check.ok) return redirectToLogin(reply, check.error);

    const partner = await findPartnerByEmail(check.email);
    if (!partner) return redirectToLogin(reply, 'NOT_A_PARTNER');

    await startSession(db, config, reply, partner.id);
    return reply.redirect(`${config.frontendUrl}/`, 302);
  });

  if (config.devLoginEnabled) {
    app.post('/api/auth/dev-login', async (request, reply) => {
      const { email } = parseInput(devLoginBody, request.body);
      const partner = await findPartnerByEmail(email);
      if (!partner) throw forbidden('Email is not a registered partner');
      await startSession(db, config, reply, partner.id);
      return reply.status(200).send(toPartnerDto(partner));
    });
  }

  app.post('/api/auth/logout', async (request, reply) => {
    await endSession(db, config, request, reply);
    return reply.status(204).send();
  });
}
