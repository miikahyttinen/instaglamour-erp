import { describe, expect, it } from 'vitest';
import {
  COST_TYPES,
  MUSICIAN_ROLES,
  PERSON_ROLES,
  LEGACY_COST_TYPES,
  ERROR_CODES,
  FIELD_CODES,
  EVENT_DISPLAY_STATUSES,
  EVENT_HISTORY_TYPES,
  LANGUAGES,
  SIGN_IN_ERROR_CODES,
  TASK_STATUSES,
  LEGACY_INVOICE_STATUSES,
  INVOICE_ROW_STATUSES,
  INVOICE_STATES,
  TECHNICAL_SETUPS,
  LOGISTICS,
  OFFER_DISPOSITIONS,
  OFFER_EVENT_TYPES,
  OFFER_HISTORY_TYPES,
  OFFER_SOURCES,
  OFFER_STATUSES,
  WARNING_CODES,
} from '../api/enums';
import en from './en';
import fi from './fi';
import i18n, { detectBrowserLanguage } from './index';
import { apiErrorMessage, apiFieldErrors, eventDisplayStatus } from './labels';
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
  ['legacyCostType', LEGACY_COST_TYPES],
  ['technicalSetup', TECHNICAL_SETUPS],
  ['logistics', LOGISTICS],
  ['eventStatus', EVENT_DISPLAY_STATUSES],
  ['taskStatus', TASK_STATUSES],
  ['invoiceStatus', LEGACY_INVOICE_STATUSES],
  ['invoiceRowStatus', INVOICE_ROW_STATUSES],
  ['invoiceState', INVOICE_STATES],
  ['offerStatus', OFFER_STATUSES],
  ['offerDisposition', OFFER_DISPOSITIONS],
  ['offerSource', OFFER_SOURCES],
  ['offerEventType', OFFER_EVENT_TYPES],
  ['offerHistoryType', OFFER_HISTORY_TYPES],
  ['eventHistoryType', EVENT_HISTORY_TYPES],
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

  it('uses glossary terms for event statuses', () => {
    expect(fi.eventStatus).toEqual({ SOLD: 'Tuleva', PLAYED: 'Soitettu', CANCELLED: 'Peruttu' });
    expect(en.eventStatus).toEqual({ SOLD: 'Upcoming', PLAYED: 'Played', CANCELLED: 'Cancelled' });
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
    expect(eventDisplayStatus({ status: 'SOLD', played: true })).toBe('PLAYED');
    expect(eventDisplayStatus({ status: 'SOLD', played: false })).toBe('SOLD');
    expect(eventDisplayStatus({ status: 'CANCELLED', played: false })).toBe('CANCELLED');
  });
});

describe('Keys / Piano (TASK-187)', () => {
  it('PIANO is no longer a cost type; KEYS keeps its label; PIANO is a legacy (history) label', () => {
    expect(COST_TYPES as readonly string[]).not.toContain('PIANO');
    expect(PERSON_ROLES).not.toContain('OTHER_ROLE');
    expect(PERSON_ROLES).toEqual(MUSICIAN_ROLES.filter((r) => r !== 'OTHER_ROLE'));
    expect(locales.fi['costType.KEYS']).toBe('Koskettimet');
    expect(locales.en['costType.KEYS']).toBe('Keys');
    expect(locales.fi['costType.PIANO']).toBeUndefined();
    expect(locales.fi['legacyCostType.PIANO']).toBe('Piano');
    expect(locales.en['legacyCostType.PIANO']).toBe('Piano');
  });
});

describe('Vocal & Keys (TASK-188)', () => {
  it('VOC_KEYS is a musician and person role right after BACKING_VOC, with FI/EN labels', () => {
    expect(MUSICIAN_ROLES.indexOf('VOC_KEYS')).toBe(MUSICIAN_ROLES.indexOf('BACKING_VOC') + 1);
    expect(PERSON_ROLES).toContain('VOC_KEYS');
    expect(COST_TYPES as readonly string[]).toContain('VOC_KEYS');
    expect(locales.fi['costType.VOC_KEYS']).toBe('Laulu & koskettimet');
    expect(locales.en['costType.VOC_KEYS']).toBe('Vocal & Keys');
  });
});

describe('OTHER_ROLE label', () => {
  it('is labelled "Oma rooli" / "Custom role"; the OTHER expense label is unchanged', () => {
    expect(locales.fi['costType.OTHER_ROLE']).toBe('Oma rooli');
    expect(locales.en['costType.OTHER_ROLE']).toBe('Custom role');
    expect(locales.fi['costType.OTHER']).toBe('Muu kulu');
    expect(locales.en['costType.OTHER']).toBe('Other expense');
  });
});
