// My gigs page texts. Included under the top-level key `myEvents` in src/i18n/{fi,en}.ts.
// Terms follow docs/glossary.md.

export const fi = {
  subtitle: 'Tulevat keikat, joilla olet tuottaja tai soitat',
  empty: 'Ei tulevia keikkoja',
  producer: 'Tuottaja',
  columns: {
    date: 'Päivä',
    event: 'Keikka',
    venue: 'Paikka',
    roles: 'Roolit',
    staffing: 'Miehitys',
  },
  offers: {
    title: 'Tarjoukset',
    empty: 'Ei avoimia tarjouksia',
    contractMissing: 'Sopimus tekemättä',
    followUp: 'Follow-up?',
    followUpDone: 'Follow-up tehty',
    columns: {
      date: 'Päivä',
      event: 'Tapahtuma',
      client: 'Asiakas',
      venue: 'Paikka',
      tag: 'Toimenpide',
    },
  },
};

export const en: typeof fi = {
  subtitle: 'Upcoming gigs where you produce or play',
  empty: 'No upcoming gigs',
  producer: 'Producer',
  columns: {
    date: 'Date',
    event: 'Gig',
    venue: 'Venue',
    roles: 'Roles',
    staffing: 'Staffing',
  },
  offers: {
    title: 'Offers',
    empty: 'No open offers',
    contractMissing: 'Contract not done',
    followUp: 'Follow-up?',
    followUpDone: 'Follow-up done',
    columns: {
      date: 'Date',
      event: 'Event',
      client: 'Client',
      venue: 'Venue',
      tag: 'To do',
    },
  },
};
