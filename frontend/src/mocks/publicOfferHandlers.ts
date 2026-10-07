import { http, HttpResponse } from 'msw';
import type { PublicOffer } from '../api/types';
import { errorResponse } from './util';

// Public offer (UC-030): `GET /api/public/offers/{token}`. No session check — this is the only
// /api route besides /api/auth/* that works signed out. Synthetic data only (BR-090).
//
// The fixtures carry internal fields on purpose (price, disposition, ids) so the mock shows the
// whitelist the backend must apply (BR-104). Read-only, so no reset is needed. When the offers
// mock (TASK-138) exists, look the token up there instead and keep `toPublicOffer`.

/** Full demo offer: references, Spotify, seller phone. Open `/o/<this>` with `npm run dev:mock`. */
export const DEMO_OFFER_TOKEN = 'demo-offer-0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
/** Minimal demo offer: no references, no Spotify, no phone, one lineup line. */
export const MINIMAL_OFFER_TOKEN = 'demo-offer-minimal-0123456789abcdefghijklmnopqrstuvwxyz';

interface MockOffer extends PublicOffer {
  id: string;
  priceCents: number | null;
  disposition: string;
  source: string | null;
  eventType: string | null;
  notes: string;
  deleted: boolean;
}

const offersByToken: Record<string, MockOffer> = {
  [DEMO_OFFER_TOKEN]: {
    id: '00000000-0000-4000-8000-0000000000f1',
    eventName: 'Summer Party X',
    clientName: 'Client A',
    eventDate: '2026-06-13',
    venue: 'Venue X',
    city: 'City Y',
    lineup: ['Vocals – Person 1', 'Guitar – Person 2', 'Bass – Person 3', 'Drums – Person 4'],
    includesText:
      'Two 60-minute sets\nSound system and lights for up to 200 guests\nTravel within the region',
    spotifyUrl: 'https://example.com/listen/demo-band',
    references: {
      fi: 'Esiintyneet mm. Client B:n ja Client C:n juhlissa.\nLisää referenssejä pyydettäessä.',
      en: 'Played at parties for Client B and Client C.\nMore references on request.',
    },
    seller: { name: 'Partner A', email: 'partner.a@example.com', phone: '+358 40 000 0001' },
    priceCents: 100000,
    disposition: 'PENDING',
    source: 'EMAIL',
    eventType: 'CORPORATE',
    notes: 'Internal note – never shown to the customer',
    deleted: false,
  },
  [MINIMAL_OFFER_TOKEN]: {
    id: '00000000-0000-4000-8000-0000000000f2',
    eventName: 'Wedding Y',
    clientName: 'Client B',
    eventDate: '2026-08-22',
    venue: 'Venue Z',
    city: null,
    lineup: ['Duo – Person 1 & Person 2'],
    includesText: null,
    spotifyUrl: null,
    references: null,
    seller: { name: 'Partner B', email: 'partner.b@example.com', phone: null },
    priceCents: null,
    disposition: 'PENDING',
    source: null,
    eventType: 'WEDDING',
    notes: '',
    deleted: false,
  },
};

/** The contract's whitelist: exactly these fields, nothing else. */
export function toPublicOffer(offer: PublicOffer): PublicOffer {
  return {
    eventName: offer.eventName,
    clientName: offer.clientName,
    eventDate: offer.eventDate,
    venue: offer.venue,
    city: offer.city,
    lineup: [...offer.lineup],
    includesText: offer.includesText,
    spotifyUrl: offer.spotifyUrl,
    references: offer.references ? { fi: offer.references.fi, en: offer.references.en } : null,
    seller: { name: offer.seller.name, email: offer.seller.email, phone: offer.seller.phone },
  };
}

export const publicOfferHandlers = [
  http.get('/api/public/offers/:token', ({ params }) => {
    const token = String(params.token);
    const offer = Object.hasOwn(offersByToken, token) ? offersByToken[token] : undefined;
    if (!offer || offer.deleted) return errorResponse(404, 'NOT_FOUND', 'Not found');
    return HttpResponse.json(toPublicOffer(offer), { headers: { 'X-Robots-Tag': 'noindex' } });
  }),
];
