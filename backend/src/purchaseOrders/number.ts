/**
 * Purchase order numbers (BR-116): `<NAME-SLUG>-<running number>`, e.g. `PERSON-ONE-0042`.
 *
 * Slug: the person's name at creation, accents removed (ä→A, ö→O, å→A, é→E…), upper case, every
 * run of other characters → one `-`, no leading/trailing `-`. A name with no letters or digits
 * left gives `PERSON`. The running number is zero-padded to 4 digits and simply grows past 9999.
 */

/** Letters that Unicode NFD does not split into base letter + accent. */
const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  ß: 'SS',
  ẞ: 'SS',
  æ: 'AE',
  Æ: 'AE',
  ø: 'O',
  Ø: 'O',
  œ: 'OE',
  Œ: 'OE',
  đ: 'D',
  Đ: 'D',
  ð: 'D',
  Ð: 'D',
  ł: 'L',
  Ł: 'L',
  þ: 'TH',
  Þ: 'TH',
  ı: 'I',
};

export const EMPTY_SLUG = 'PERSON';

export function purchaseOrderSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // combining marks (accents)
    .replace(/[^ -~]/g, (ch) => SPECIAL_LETTERS[ch] ?? '-') // anything outside printable ASCII
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? EMPTY_SLUG : slug;
}

export function purchaseOrderNumber(name: string, seq: number): string {
  return `${purchaseOrderSlug(name)}-${String(seq).padStart(4, '0')}`;
}
