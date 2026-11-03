import { describe, expect, it } from 'vitest';
import { checkGoogleIdentity } from '../src/auth/google.js';

const CONFIG = { authAllowedDomain: 'example.com', authExtraAllowedEmails: [] as string[] };

describe('checkGoogleIdentity (BR-070, mocked verified token payloads)', () => {
  it('accepts a verified email in the allowed domain and normalises it', () => {
    expect(checkGoogleIdentity({ email: 'Partner.A@Example.com', email_verified: true, hd: 'example.com' }, CONFIG)).toEqual({
      ok: true,
      email: 'partner.a@example.com',
    });
  });

  it('accepts when Google sends no hd claim', () => {
    expect(checkGoogleIdentity({ email: 'partner.a@example.com', email_verified: true }, CONFIG).ok).toBe(true);
  });

  it('rejects another domain', () => {
    expect(checkGoogleIdentity({ email: 'someone@example.org', email_verified: true }, CONFIG)).toEqual({
      ok: false,
      error: 'WRONG_DOMAIN',
    });
  });

  it('rejects a subdomain or look-alike domain', () => {
    expect(checkGoogleIdentity({ email: 'a@sub.example.com', email_verified: true }, CONFIG)).toMatchObject({ error: 'WRONG_DOMAIN' });
    expect(checkGoogleIdentity({ email: 'a@example.com.evil.test', email_verified: true }, CONFIG)).toMatchObject({ error: 'WRONG_DOMAIN' });
    expect(checkGoogleIdentity({ email: 'a@notexample.com', email_verified: true }, CONFIG)).toMatchObject({ error: 'WRONG_DOMAIN' });
  });

  it('rejects an unverified email even in the allowed domain', () => {
    expect(checkGoogleIdentity({ email: 'partner.a@example.com', email_verified: false }, CONFIG)).toMatchObject({ error: 'WRONG_DOMAIN' });
    expect(checkGoogleIdentity({ email: 'partner.a@example.com' }, CONFIG)).toMatchObject({ error: 'WRONG_DOMAIN' });
  });

  it('rejects a mismatching hosted-domain claim', () => {
    expect(checkGoogleIdentity({ email: 'partner.a@example.com', email_verified: true, hd: 'example.org' }, CONFIG)).toMatchObject({
      error: 'WRONG_DOMAIN',
    });
  });

  it('fails sign-in when the token has no email', () => {
    expect(checkGoogleIdentity({ email_verified: true }, CONFIG)).toEqual({ ok: false, error: 'SIGN_IN_FAILED' });
  });

  it('never accepts anything when no domain is configured', () => {
    expect(checkGoogleIdentity({ email: 'a@example.com', email_verified: true }, { authAllowedDomain: '', authExtraAllowedEmails: [] })).toMatchObject({ error: 'WRONG_DOMAIN' });
  });
});
