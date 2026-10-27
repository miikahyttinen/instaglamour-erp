// Year page (UC-022) texts. Included under the top-level key `year` in src/i18n/{fi,en}.ts.
// Terms follow docs/glossary.md.

export const fi = {
  summary: 'Tapahtumia {{events}} · Tunteja {{hours}}',
  events: {
    title: 'Tapahtumat',
    eventCount: 'Tapahtumia',
    cancelledCount: 'Peruttuja',
    soldEventsSum: 'Myytyjen tapahtumien summa',
    budgetedCosts: 'Kulut, budjetti',
    actualCosts: 'Kulut, toteuma',
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
    title: 'Tulevat tapahtumat',
    none: 'Ei tulevia tapahtumia.',
    notFullyStaffed: 'Miehitys kesken',
    showAll: 'Kaikki tapahtumat',
    date: 'Päivä',
    event: 'Tapahtuma',
    staffing: 'Miehitys',
  },
};

export const en: typeof fi = {
  summary: 'Events {{events}} · Hours {{hours}}',
  events: {
    title: 'Events',
    eventCount: 'Events',
    cancelledCount: 'Cancelled',
    soldEventsSum: 'Sold events sum',
    budgetedCosts: 'Costs, budget',
    actualCosts: 'Costs, actual',
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
    title: 'Upcoming events',
    none: 'No upcoming events.',
    notFullyStaffed: 'Not fully staffed',
    showAll: 'All events',
    date: 'Date',
    event: 'Event',
    staffing: 'Staffing',
  },
};
