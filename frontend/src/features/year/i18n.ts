// Year page (UC-022) texts. Included under the top-level key `year` in src/i18n/{fi,en}.ts.
// Terms follow docs/glossary.md.

export const fi = {
  summary: 'Keikkoja {{events}} · Tunteja {{hours}}',
  events: {
    title: 'Keikat',
    eventCount: 'Keikkoja',
    cancelledCount: 'Peruttuja',
    soldEventsSum: 'Myytyjen keikkojen summa',
    costs: 'Kulut',
    marginBudget: 'Kate, budjetti',
    marginActual: 'Kate, toteuma',
    costsChart: 'Kulut, budjetti ja toteuma',
    marginChart: 'Kate, budjetti ja toteuma',
  },
  hours: {
    title: 'Tunnit',
    total: 'Yhteensä',
    unknownPartner: 'Tuntematon osakas',
  },
  budget: {
    title: 'Budjetti',
    category: 'Kiinteät',
    budget: 'Budjetti',
    actual: 'Toteuma',
    expense: 'Kulut',
    income: 'Tuotot',
    yearResult: 'Vuoden tulos',
  },
  upcoming: {
    title: 'Tulevat keikat',
    none: 'Ei tulevia keikkoja.',
    notFullyStaffed: 'Miehitys kesken',
    showAll: 'Kaikki keikat',
    date: 'Päivä',
    event: 'Keikka',
    staffing: 'Miehitys',
  },
};

export const en: typeof fi = {
  summary: 'Gigs {{events}} · Hours {{hours}}',
  events: {
    title: 'Gigs',
    eventCount: 'Gigs',
    cancelledCount: 'Cancelled',
    soldEventsSum: 'Sold gigs sum',
    costs: 'Costs',
    marginBudget: 'Margin, budget',
    marginActual: 'Margin, actual',
    costsChart: 'Costs, budget and actual',
    marginChart: 'Margin, budget and actual',
  },
  hours: {
    title: 'Hours',
    total: 'Total',
    unknownPartner: 'Unknown partner',
  },
  budget: {
    title: 'Budget',
    category: 'Fixed',
    budget: 'Budget',
    actual: 'Actual',
    expense: 'Expenses',
    income: 'Income',
    yearResult: 'Year result',
  },
  upcoming: {
    title: 'Upcoming gigs',
    none: 'No upcoming gigs.',
    notFullyStaffed: 'Not fully staffed',
    showAll: 'All gigs',
    date: 'Date',
    event: 'Gig',
    staffing: 'Staffing',
  },
};
