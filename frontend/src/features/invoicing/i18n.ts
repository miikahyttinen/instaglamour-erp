// Laskutus page texts (api-contract "Laskutus page: all invoice rows"). Included in fi.ts / en.ts
// under the `invoicing` key. EN must have exactly the same keys as FI.

export const fi = {
  invoicing: {
    listLabel: 'Laskurivit',
    columns: {
      status: 'Tila',
      created: 'Luotu',
      client: 'Asiakas',
      gig: 'Keikka',
      description: 'Kuvaus',
      amount: 'Summa',
      details: 'Laskutustiedot',
    },
    empty: 'Ei laskuja',
    auto: 'Automaattinen',
    autoTitle: 'Luotu automaattisesti 48 h keikan jälkeen',
    showMore: 'Näytä kaikki',
    showLess: 'Näytä vähemmän',
  },
};

export const en: typeof fi = {
  invoicing: {
    listLabel: 'Invoice rows',
    columns: {
      status: 'Status',
      created: 'Created',
      client: 'Client',
      gig: 'Gig',
      description: 'Description',
      amount: 'Amount',
      details: 'Invoicing details',
    },
    empty: 'No invoices',
    auto: 'Automatic',
    autoTitle: 'Created automatically 48 h after the gig',
    showMore: 'Show all',
    showLess: 'Show less',
  },
};
