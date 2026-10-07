import { describe, expect, it } from 'vitest';
import {
  COST_TYPES,
  ERROR_CODES,
  FIELD_CODES,
  GIG_DISPLAY_STATUSES,
  GIG_EVENT_TYPES,
  LANGUAGES,
  SIGN_IN_ERROR_CODES,
  TASK_STATUSES,
  TECHNICAL_SETUPS,
  LOGISTICS,
  OFFER_DISPOSITIONS,
  OFFER_STATUSES,
  WARNING_CODES,
} from '../api/enums';
import en from './en';
import fi from './fi';
import i18n, { detectBrowserLanguage } from './index';
import { apiErrorMessage, apiFieldErrors, gigDisplayStatus } from './labels';
import { ApiError } from '../api/client';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const locales = { fi: flatten(fi as Tree), en: flatten(en as Tree) };

const enumNamespaces: [string, readonly string[]][] = [
  ['costType', COST_TYPES],
  ['technicalSetup', TECHNICAL_SETUPS],
  ['logistics', LOGISTICS],
  ['gigStatus', GIG_DISPLAY_STATUSES],
  ['taskStatus', TASK_STATUSES],
  ['offerStatus', OFFER_STATUSES],
  ['offerDisposition', OFFER_DISPOSITIONS],
  ['gigEventType', GIG_EVENT_TYPES],
  ['errors', ERROR_CODES],
  ['fields', FIELD_CODES],
  ['warnings', WARNING_CODES],
  ['signIn.errors', SIGN_IN_ERROR_CODES],
  ['language', LANGUAGES],
];

describe('translations', () => {
  it('FI and EN have exactly the same keys', () => {
    expect(Object.keys(locales.en).sort()).toEqual(Object.keys(locales.fi).sort());
  });

  it('no translation is empty', () => {
    for (const [lang, entries] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(entries)) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  describe.each(enumNamespaces)('every %s code has FI and EN labels', (namespace, codes) => {
    it.each(LANGUAGES)('%s', (lang) => {
      const missing = codes.filter((code) => !locales[lang][`${namespace}.${code}`]);
      expect(missing).toEqual([]);
    });
  });

  it('uses glossary terms for gig statuses', () => {
    expect(fi.gigStatus).toEqual({ SOLD: 'Myyty', PLAYED: 'Soitettu', CANCELLED: 'Peruttu' });
    expect(en.gigStatus).toEqual({ SOLD: 'Sold', PLAYED: 'Played', CANCELLED: 'Cancelled' });
    expect(fi.costType.OFFICE).toBe('Toimisto');
    expect(fi.costType.SALES).toBe('Myynti');
    expect(fi.costType.PRODUCTION).toBe('Tuotanto');
  });
});

describe('language detection', () => {
  it('defaults to Finnish', () => {
    expect(detectBrowserLanguage([])).toBe('fi');
    expect(detectBrowserLanguage(['sv-SE', 'de'])).toBe('fi');
  });

  it('uses the first supported browser language', () => {
    expect(detectBrowserLanguage(['en-US', 'fi'])).toBe('en');
    expect(detectBrowserLanguage(['fi-FI', 'en'])).toBe('fi');
  });
});

describe('label helpers', () => {
  const t = i18n.getFixedT('en');

  it('maps error codes to translations and never shows the server message', () => {
    const error = new ApiError(403, 'FORBIDDEN', 'Internal English message');
    expect(apiErrorMessage(t, error)).toBe("You're not allowed to do this.");
    expect(apiErrorMessage(t, new Error('boom'))).toBe('Something went wrong. Please try again.');
  });

  it('maps field codes to translations', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'x', { venue: 'REQUIRED', hours: 'INVALID_HOURS' });
    expect(apiFieldErrors(t, error)).toEqual({
      venue: 'Required.',
      hours: 'Hours must be 0.25–24 in quarter-hour steps.',
    });
  });

  it('derives the played display status', () => {
    expect(gigDisplayStatus({ status: 'SOLD', played: true })).toBe('PLAYED');
    expect(gigDisplayStatus({ status: 'SOLD', played: false })).toBe('SOLD');
    expect(gigDisplayStatus({ status: 'CANCELLED', played: false })).toBe('CANCELLED');
  });
});
