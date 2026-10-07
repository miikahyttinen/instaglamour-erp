import { http, HttpResponse } from 'msw';
import { db } from './data';
import { toPublicOffer, toPublicView } from './offerStore';
import { errorResponse } from './util';

// Public offer (UC-030): `GET /api/public/offers/{token}`. No session check — this is the only
// /api route besides /api/auth/* that works signed out. The token is looked up in the offers
// mock (db.offers, offerStore.ts); `toPublicOffer` applies the contract's whitelist, so price,
// disposition, source, event type, gig, notes and ids never leave (BR-104). A regenerated
// (old) token or a deleted offer is 404 like an unknown one. Synthetic data only (BR-090).

export { DEMO_OFFER_TOKEN, MINIMAL_OFFER_TOKEN } from './offerSeed';
export { toPublicOffer } from './offerStore';

export const publicOfferHandlers = [
  http.get('/api/public/offers/:token', ({ params }) => {
    const token = String(params.token);
    const offer = db.offers.offers.find((o) => o.shareToken === token);
    if (!offer || offer.deletedAt !== null) return errorResponse(404, 'NOT_FOUND', 'Not found');
    const body = toPublicOffer(toPublicView(db.offers, offer, { clients: db.gigs.clients, partners: db.partners }));
    return HttpResponse.json(body, { headers: { 'X-Robots-Tag': 'noindex' } });
  }),
];
