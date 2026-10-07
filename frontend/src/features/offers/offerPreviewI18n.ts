// Customer-facing offer texts (UC-030): the shared OfferPreview and the public page /o/:token.
// Spread into fi.ts / en.ts. EN must have exactly the same keys as FI. Terms follow
// docs/glossary.md. The other offer screens (TASK-138) keep their texts elsewhere.

export const fi = {
  offerPreview: {
    eyebrow: 'Tarjous',
    details: 'Tapahtuman tiedot',
    client: 'Asiakas',
    date: 'Päivämäärä',
    venue: 'Paikka',
    lineup: 'Kokoonpano',
    includes: 'Tarjoukseen sisältyy',
    spotify: 'Kuuntele Spotifyssa',
    newTab: '(avautuu uuteen välilehteen)',
    references: 'Referenssit',
    contact: 'Yhteystiedot',
    email: 'Sähköposti',
    phone: 'Puhelin',
  },
  publicOffer: {
    loading: 'Ladataan tarjousta…',
    notFoundTitle: 'Tarjousta ei löytynyt',
    notFoundText: 'Linkki ei ole voimassa. Pyydä uusi linkki yhteyshenkilöltäsi.',
    errorTitle: 'Tarjousta ei voitu ladata',
    errorText: 'Tarkista verkkoyhteys ja yritä uudelleen.',
    brand: 'Instaglamour',
  },
};

export const en: typeof fi = {
  offerPreview: {
    eyebrow: 'Offer',
    details: 'Event details',
    client: 'Client',
    date: 'Date',
    venue: 'Venue',
    lineup: 'Lineup',
    includes: "What's included",
    spotify: 'Listen on Spotify',
    newTab: '(opens in a new tab)',
    references: 'References',
    contact: 'Contact',
    email: 'Email',
    phone: 'Phone',
  },
  publicOffer: {
    loading: 'Loading offer…',
    notFoundTitle: 'Offer not found',
    notFoundText: 'This link is not valid. Ask your contact person for a new link.',
    errorTitle: 'Could not load the offer',
    errorText: 'Check your connection and try again.',
    brand: 'Instaglamour',
  },
};
