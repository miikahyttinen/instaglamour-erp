import { http, HttpResponse } from 'msw';
import { db } from './data';
import { toPublicOffer, toPublicView } from './offerStore';
import { errorResponse } from './util';

// Public offer (UC-030): `GET /api/public/offers/{token}` and its reference photos (BR-108). No
// session check — these are the only /api routes besides /api/auth/* that work signed out. The
// token is looked up in the offers mock (db.offers, offerStore.ts); `toPublicOffer` applies the
// contract's whitelist, so price, disposition, source, event type, gig, notes and ids never leave
// (BR-104). A regenerated (old) token or a deleted offer is 404 like an unknown one. Synthetic
// data only (BR-090).

export { DEMO_OFFER_TOKEN, MINIMAL_OFFER_TOKEN } from './offerSeed';
export { toPublicOffer } from './offerStore';

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Not found');
const NOINDEX = { 'X-Robots-Tag': 'noindex' };

const liveOffer = (token: string) =>
  db.offers.offers.find((o) => o.shareToken === token && o.deletedAt === null);

export const publicOfferHandlers = [
  http.get('/api/public/offers/:token', ({ params }) => {
    const offer = liveOffer(String(params.token));
    if (!offer) return notFound();
    const body = toPublicOffer(
      toPublicView(db.offers, offer, {
        clients: db.gigs.clients,
        partners: db.partners,
        references: db.references,
      }),
    );
    return HttpResponse.json(body, { headers: NOINDEX });
  }),

  // BR-108: only for a valid token of an offer that shows references, an active reference with a photo.
  http.get('/api/public/offers/:token/references/:id/image', ({ params }) => {
    const offer = liveOffer(String(params.token));
    const ref = db.references.references.find((r) => r.id === params.id);
    if (!offer?.showReferences || !ref?.active || !ref.image) return notFound();
    return new HttpResponse(ref.image.content, {
      headers: { ...NOINDEX, 'Content-Type': ref.image.contentType },
    });
  }),
];
