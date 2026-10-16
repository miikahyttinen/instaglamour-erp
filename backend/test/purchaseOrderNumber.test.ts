/** PO number slug (BR-116). Synthetic names only. */
import { describe, expect, it } from 'vitest';
import { purchaseOrderNumber, purchaseOrderSlug } from '../src/purchaseOrders/number.js';

describe('purchaseOrderSlug (BR-116)', () => {
  it.each([
    ['Person One', 'PERSON-ONE'],
    ['person one', 'PERSON-ONE'],
    ['Pärsön Åne', 'PARSON-ANE'],
    ['Ääkkönen Öö', 'AAKKONEN-OO'],
    ['Émile Çedric Ñu', 'EMILE-CEDRIC-NU'],
    ['Søren Æble Groß', 'SOREN-AEBLE-GROSS'],
    ['Łukasz Đoković', 'LUKASZ-DOKOVIC'],
    ['  Person   1  ', 'PERSON-1'],
    ['Person--One', 'PERSON-ONE'],
    ["Person O'Name-Two", 'PERSON-O-NAME-TWO'],
    ['-Person.One-', 'PERSON-ONE'],
    ['Person 1 (DJ) / Band', 'PERSON-1-DJ-BAND'],
    ['Person\tTab\nLine', 'PERSON-TAB-LINE'],
  ])('%j → %s', (name, slug) => {
    expect(purchaseOrderSlug(name)).toBe(slug);
  });

  it.each(['', '   ', '---', '日本', '🎸🎤', '!!!'])('no letters or digits (%j) → PERSON', (name) => {
    expect(purchaseOrderSlug(name)).toBe('PERSON');
  });

  it('keeps ASCII letters and digits around removed symbols', () => {
    expect(purchaseOrderSlug('Person 日本 2')).toBe('PERSON-2');
  });
});

describe('purchaseOrderNumber (BR-116)', () => {
  it('pads the running number to 4 digits and grows past 9999', () => {
    expect(purchaseOrderNumber('Person One', 1)).toBe('PERSON-ONE-0001');
    expect(purchaseOrderNumber('Person One', 42)).toBe('PERSON-ONE-0042');
    expect(purchaseOrderNumber('Person One', 9999)).toBe('PERSON-ONE-9999');
    expect(purchaseOrderNumber('Person One', 10000)).toBe('PERSON-ONE-10000');
    expect(purchaseOrderNumber('', 7)).toBe('PERSON-0007');
  });
});
