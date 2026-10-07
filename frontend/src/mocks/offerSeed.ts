// Synthetic demo offers for `npm run dev:mock` and tests (BR-090: no real names or numbers).
// Most dates are in the current year so the default offer list shows something; the two demo
// public links keep fixed dates (their tests check the weekday).
import type { Partner } from '../api/types';
import { CLIENT_IDS } from './gigSeed';
import { nowTs, type GigState } from './gigStore';
import { createOffer, logOfferEvent, markConverted, type OfferState } from './offerStore';

/** Full demo offer: references, Spotify, seller phone. Open `/o/<this>` with `npm run dev:mock`. */
export const DEMO_OFFER_TOKEN = 'demo-offer-0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
/** Minimal demo offer: no references, no Spotify, no phone, one lineup line. */
export const MINIMAL_OFFER_TOKEN = 'demo-offer-minimal-0123456789abcdefghijklmnopqrstuvwxyz';

/** Fixed ids of the seeded offers (`/offers/<id>` keeps working after a reload in dev:mock). */
const seedId = (n: number) => `00000000-0000-4000-8000-0000000006${String(n).padStart(2, '0')}`;

export function emptyOfferState(partners: Partner[]): OfferState {
  const [a, b, c] = partners;
  return {
    offers: [],
    events: [],
    settings: {
      defaultIncludes: 'Two 60-minute sets\nSound system and lights for up to 200 guests\nTravel within the region',
      defaultSpotifyUrl: 'https://example.com/listen/demo-band',
      referencesFi: 'Esiintyneet mm. Client B:n ja Client C:n juhlissa.\nLisää referenssejä pyydettäessä.',
      referencesEn: 'Played at parties for Client B and Client C.\nMore references on request.',
      partnerPhones: {
        ...(a ? { [a.id]: '+358 40 000 0001' } : {}),
        ...(b ? { [b.id]: null } : {}),
        ...(c ? { [c.id]: '+358 40 000 0003' } : {}),
      },
    },
  };
}

export function seedOffers(gigs: GigState, partners: Partner[], year = new Date().getFullYear()): OfferState {
  const state = emptyOfferState(partners);
  const [a, b, c] = partners;
  if (!a || !b || !c) return state;
  const { settings } = state;
  const base = {
    city: null,
    lineup: ['Vocals – Person 1', 'Guitar – Person 2', 'Bass – Person 3', 'Drums – Person 4'],
    includesText: settings.defaultIncludes,
    spotifyUrl: settings.defaultSpotifyUrl,
    showReferences: true,
    priceCents: 100000,
    sellerId: a.id,
    source: null,
    eventType: null,
  };

  createOffer(
    state,
    {
      ...base,
      id: seedId(1),
      clientId: CLIENT_IDS.a,
      eventName: 'Summer Party X',
      eventDate: '2026-06-13',
      venue: 'Venue X',
      city: 'City Y',
      source: 'EMAIL',
      eventType: 'CORPORATE',
      shareToken: DEMO_OFFER_TOKEN,
      internalNote: 'Internal note – never shown to the customer',
    },
    a.id,
  );
  createOffer(
    state,
    {
      ...base,
      id: seedId(2),
      clientId: CLIENT_IDS.b,
      eventName: 'Wedding Y',
      eventDate: '2026-08-22',
      venue: 'Venue Z',
      lineup: ['Duo – Person 1 & Person 2'],
      includesText: null,
      spotifyUrl: null,
      showReferences: false,
      priceCents: null,
      sellerId: b.id,
      eventType: 'WEDDING',
      shareToken: MINIMAL_OFFER_TOKEN,
    },
    b.id,
  );
  createOffer(
    state,
    {
      ...base,
      id: seedId(3),
      clientId: CLIENT_IDS.c,
      eventName: 'Birthday V',
      eventDate: `${year}-05-02`,
      venue: 'Venue Y',
      city: 'City X',
      priceCents: 50000,
      sellerId: b.id,
      source: 'OTHER',
      eventType: 'PRIVATE',
      disposition: 'NO_RESPONSE',
    },
    b.id,
  );
  createOffer(
    state,
    {
      ...base,
      id: seedId(4),
      clientId: CLIENT_IDS.c,
      eventName: 'Company Party Z',
      eventDate: `${year}-09-12`,
      venue: 'Venue X',
      city: 'City Z',
      priceCents: 80000,
      source: 'INSTAGRAM',
      eventType: 'CORPORATE',
      disposition: 'LOST_PRICE',
    },
    a.id,
  );
  createOffer(
    state,
    {
      ...base,
      id: seedId(5),
      clientId: CLIENT_IDS.b,
      eventName: 'Christmas Party W',
      eventDate: `${year}-12-05`,
      venue: 'Venue Y',
      city: 'City Y',
      priceCents: 150000,
      sellerId: c.id,
      source: 'WEBSITE',
      eventType: 'CORPORATE',
    },
    c.id,
  );
  createOffer(
    state,
    {
      ...base,
      id: seedId(6),
      clientId: CLIENT_IDS.a,
      eventName: 'Gala Q',
      eventDate: `${year}-12-31`,
      venue: 'Venue Z',
      city: 'City X',
      priceCents: 200000,
      source: 'EMAIL',
      eventType: 'PRIVATE',
    },
    a.id,
  );

  // Won and converted: linked to the seeded Client A gig at Venue Z (gigSeed.ts).
  const gig = gigs.gigs.find((g) => g.clientId === CLIENT_IDS.a && g.venue === 'Venue Z');
  const won = createOffer(
    state,
    {
      ...base,
      id: seedId(7),
      clientId: CLIENT_IDS.a,
      eventName: 'Autumn Event U',
      eventDate: gig?.startDate ?? `${year}-11-20`,
      venue: 'Venue Z',
      priceCents: gig?.priceCents ?? 300000,
      source: 'WEBSITE',
      eventType: 'CORPORATE',
    },
    a.id,
  );
  if (gig) {
    markConverted(state, won, gig.id, a.id);
    gig.offerId = won.id;
  }

  // In the Deleted view.
  const deleted = createOffer(
    state,
    {
      ...base,
      id: seedId(8),
      clientId: CLIENT_IDS.b,
      eventName: 'Event Deleted T',
      eventDate: `${year}-07-01`,
      venue: 'Venue Y',
      eventType: 'PRIVATE',
    },
    a.id,
  );
  deleted.deletedAt = nowTs();
  logOfferEvent(state, deleted.id, 'DELETED', a.id);
  return state;
}
