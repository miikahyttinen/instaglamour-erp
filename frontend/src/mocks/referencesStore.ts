// In-memory mock of the references (docs/api-contract.md → References, BR-108). Pure functions
// over `ReferencesState`; handlers in referencesHandlers.ts and publicOfferHandlers.ts.
// Synthetic quotes only (BR-090) and no seeded photos, so the UI shows its placeholders.
import type { Id, PublicOfferReference, Reference } from '../api/types';
import { mockId } from './eventStore';

export interface MockReferenceImage {
  contentType: string;
  content: Blob;
}

export interface MockReference {
  id: Id;
  quoteFi: string;
  quoteEn: string | null;
  author: string;
  active: boolean;
  image: MockReferenceImage | null;
  /** Changes on every upload / remove (contract `Reference.imageVersion`). */
  imageVersion: string | null;
}

/** The list order is the sort order. */
export interface ReferencesState {
  references: MockReference[];
}

export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** PNG / JPG / WebP by MIME type or, when the type is missing, by file extension. */
export function detectReferenceImageType(file: File): string | null {
  if (Object.values(IMAGE_TYPES).includes(file.type)) return file.type;
  if (file.type) return null;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return IMAGE_TYPES[ext] ?? null;
}

/** Fixed ids so `npm run dev:mock` links survive a reload. */
export const REFERENCE_IDS = {
  a: '00000000-0000-4000-8000-000000000701',
  b: '00000000-0000-4000-8000-000000000702',
  c: '00000000-0000-4000-8000-000000000703',
  d: '00000000-0000-4000-8000-000000000704',
};

export function seedReferences(): ReferencesState {
  return {
    references: [
      {
        id: REFERENCE_IDS.a,
        quoteFi: 'Esimerkkilainaus A: tanssilattia oli täynnä koko illan.\nSuosittelemme lämpimästi.',
        quoteEn: 'Sample quote A: the dance floor was full all night.\nWarmly recommended.',
        author: 'Person 5, Client A',
        active: true,
        image: null,
        imageVersion: null,
      },
      {
        id: REFERENCE_IDS.b,
        quoteFi: 'Esimerkkilainaus B: sujuva yhteistyö alusta loppuun.',
        quoteEn: null,
        author: 'Client B',
        active: true,
        image: null,
        imageVersion: null,
      },
      {
        id: REFERENCE_IDS.c,
        quoteFi: 'Esimerkkilainaus C: juuri sopiva ohjelma juhliimme.',
        quoteEn: 'Sample quote C: just the right show for our party.',
        author: 'Person 6, Client C',
        active: true,
        image: null,
        imageVersion: null,
      },
      {
        id: REFERENCE_IDS.d,
        quoteFi: 'Esimerkkilainaus D (ei käytössä).',
        quoteEn: 'Sample quote D (inactive).',
        author: 'Client D',
        active: false,
        image: null,
        imageVersion: null,
      },
    ],
  };
}

let versionCounter = 0;

/** Sets or clears the photo and gives it a new, unique `imageVersion` (upload timestamp + counter). */
export function setReferenceImage(ref: MockReference, image: MockReferenceImage | null): void {
  ref.image = image;
  versionCounter += 1;
  ref.imageVersion = `${Date.now()}-${versionCounter}`;
}

export function toReference(state: ReferencesState, ref: MockReference): Reference {
  return {
    id: ref.id,
    quoteFi: ref.quoteFi,
    quoteEn: ref.quoteEn,
    author: ref.author,
    hasImage: ref.image !== null,
    imageVersion: ref.imageVersion,
    sortOrder: state.references.indexOf(ref),
    active: ref.active,
  };
}

export const listReferences = (state: ReferencesState): Reference[] =>
  state.references.map((r) => toReference(state, r));

export function createReference(
  state: ReferencesState,
  input: { quoteFi: string; quoteEn: string | null; author: string; active: boolean },
): MockReference {
  const ref: MockReference = { id: mockId(), ...input, image: null, imageVersion: null };
  state.references.push(ref);
  return ref;
}

/** `ids` must be exactly the current ids (any order); otherwise returns false and changes nothing. */
export function reorderReferences(state: ReferencesState, ids: Id[]): boolean {
  const current = state.references.map((r) => r.id);
  if (ids.length !== current.length || new Set(ids).size !== ids.length) return false;
  if (!ids.every((id) => current.includes(id))) return false;
  state.references = ids.map((id) => state.references.find((r) => r.id === id)!);
  return true;
}

/** BR-108: active references in order; image URLs scoped to the offer token. */
export function publicReferences(state: ReferencesState, token: string): PublicOfferReference[] {
  return state.references
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id,
      quote: { fi: r.quoteFi, en: r.quoteEn },
      author: r.author,
      imageUrl: r.image
        ? `/api/public/offers/${token}/references/${r.id}/image?v=${encodeURIComponent(r.imageVersion ?? '')}`
        : null,
    }));
}
