// Synthetic mock data only (BR-090): no real names, domains or business numbers.
import {
  EXPENSE_CATEGORIES,
  INTERNAL_ROLES,
  MUSICIAN_ROLES,
  TECHNICAL_SETUPS,
} from '../api/enums';
import type { Partner, ReferenceData } from '../api/types';

export interface MockDb {
  partners: Partner[];
  /** Partner id of the signed-in mock user, or null. */
  sessionPartnerId: string | null;
  reference: Omit<ReferenceData, 'partners'>;
}

const SESSION_KEY = 'mock-session-partner-id';

function initialPartners(): Partner[] {
  const year = new Date().getFullYear();
  return [
    {
      id: '00000000-0000-4000-8000-00000000000a',
      personId: '00000000-0000-4000-8000-0000000000a1',
      name: 'Partner A',
      email: 'partner.a@example.com',
      language: 'fi',
      selectedYear: year,
    },
    {
      id: '00000000-0000-4000-8000-00000000000b',
      personId: '00000000-0000-4000-8000-0000000000b1',
      name: 'Partner B',
      email: 'partner.b@example.com',
      language: 'en',
      selectedYear: year,
    },
    {
      id: '00000000-0000-4000-8000-00000000000c',
      personId: '00000000-0000-4000-8000-0000000000c1',
      name: 'Partner C',
      email: 'partner.c@example.com',
      language: 'fi',
      selectedYear: year,
    },
  ];
}

function initialReference(): MockDb['reference'] {
  return {
    lineupTemplates: [
      {
        id: '00000000-0000-4000-8000-000000000101',
        name: 'Template A',
        roles: [
          { role: 'VOC', defaultFeeCents: 10000 },
          { role: 'GUITAR', defaultFeeCents: 10000 },
          { role: 'BASS', defaultFeeCents: 10000 },
          { role: 'DRUMS', defaultFeeCents: 10000 },
        ],
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        name: 'Template B',
        roles: [
          { role: 'VOC', defaultFeeCents: 10000 },
          { role: 'KEYS', defaultFeeCents: 10000 },
        ],
      },
    ],
    settings: {
      officeDefaultCents: 1000,
      salesDefaultCents: 1000,
      productionDefaultCents: 1000,
      loadInDeductionCents: 1000,
    },
    costTypes: {
      musicianRoles: [...MUSICIAN_ROLES],
      internalRoles: [...INTERNAL_ROLES],
      expenseCategories: [...EXPENSE_CATEGORIES],
    },
    technicalSetups: [...TECHNICAL_SETUPS],
    budgetCategories: [
      { id: '00000000-0000-4000-8000-000000000201', code: 'CATEGORY_A', nameFi: 'Kategoria A', nameEn: 'Category A', budgeted: true },
      { id: '00000000-0000-4000-8000-000000000202', code: 'CATEGORY_B', nameFi: 'Kategoria B', nameEn: 'Category B', budgeted: true },
      { id: '00000000-0000-4000-8000-000000000203', code: 'CATEGORY_C', nameFi: 'Kategoria C', nameEn: 'Category C', budgeted: false },
    ],
  };
}

function readStoredSession(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

export const db: MockDb = {
  partners: initialPartners(),
  sessionPartnerId: readStoredSession(),
  reference: initialReference(),
};

/** Sets the mock session; kept in sessionStorage so a browser reload stays signed in. */
export function setMockSession(partnerId: string | null): void {
  db.sessionPartnerId = partnerId;
  try {
    if (partnerId) globalThis.sessionStorage?.setItem(SESSION_KEY, partnerId);
    else globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable: session lives in memory only
  }
}

/** Resets all mock state (used between tests). */
export function resetMockDb(): void {
  db.partners = initialPartners();
  db.reference = initialReference();
  setMockSession(null);
}
