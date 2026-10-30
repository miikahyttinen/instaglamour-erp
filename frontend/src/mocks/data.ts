// Synthetic mock data only (BR-090): no real names, domains or business numbers.
import {
  EXPENSE_CATEGORIES,
  INTERNAL_ROLES,
  LOGISTICS,
  MUSICIAN_ROLES,
  TECHNICAL_SETUPS,
} from '../api/enums';
import type { Partner, ReferenceData } from '../api/types';
import { seedBudget, type BudgetState } from './budgetStore';
import { seedFreelancer, type FreelancerState } from './freelancerStore';
import { seedEventState } from './eventSeed';
import { emptyEventState, type EventState } from './eventStore';
import { seedHours, type HoursState } from './hoursStore';
import { resetImportStore } from './importStore';
import { seedOffers } from './offerSeed';
import type { OfferState } from './offerStore';
import { seedPartnerPurchaseOrders } from './purchaseOrderStore';
import { seedReferences, type ReferencesState } from './referencesStore';
import { seedTasks, type TasksState } from './tasksStore';

export interface MockDb {
  partners: Partner[];
  /** Partner id of the signed-in mock user, or null. */
  sessionPartnerId: string | null;
  reference: Omit<ReferenceData, 'partners'>;
  /** Events, cost lines, invoice rows, history and people. */
  events: EventState;
  /** Offers, their history and the `offers.*` settings (UC-028…UC-031). */
  offers: OfferState;
  /** References shown on offers (BR-108). */
  references: ReferencesState;
  tasks: TasksState;
  hours: HoursState;
  budget: BudgetState;
  /** Freelancer link tokens and purchase orders (UC-033, UC-034). */
  freelancer: FreelancerState;
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
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-00000000000b',
      personId: '00000000-0000-4000-8000-0000000000b1',
      name: 'Partner B',
      email: 'partner.b@example.com',
      language: 'en',
      selectedYear: year,
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-00000000000c',
      personId: '00000000-0000-4000-8000-0000000000c1',
      name: 'Partner C',
      email: 'partner.c@example.com',
      language: 'fi',
      selectedYear: year,
      active: true,
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
    logistics: [...LOGISTICS],
    budgetCategories: [
      // Active budget rows only, in creation order (UC-020). Removed rows leave this list; their
      // amounts stay in db.budget. No fuel or actuals-only rows.
      { id: '00000000-0000-4000-8000-000000000201', name: 'Category A' },
      { id: '00000000-0000-4000-8000-000000000202', name: 'Category B' },
      { id: '00000000-0000-4000-8000-000000000203', name: 'Category C' },
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

/** Freelancer links + POs (UC-033) and the extra partner-page demo POs (UC-034): one PO store. */
function seedFreelancerAndPurchaseOrders(
  events: EventState,
  partners: Partner[],
  reference: MockDb['reference'],
): FreelancerState {
  const state = seedFreelancer(events, partners[0]?.id);
  seedPartnerPurchaseOrders(state, events, partners, reference);
  return state;
}

function initialEvents(partners: Partner[], reference: MockDb['reference']): EventState {
  const state = emptyEventState();
  seedEventState(state, partners, reference);
  return state;
}

const startPartners = initialPartners();
const startReference = initialReference();
const startEvents = initialEvents(startPartners, startReference);

export const db: MockDb = {
  partners: startPartners,
  sessionPartnerId: readStoredSession(),
  reference: startReference,
  events: startEvents,
  offers: seedOffers(startEvents, startPartners),
  references: seedReferences(),
  tasks: seedTasks(),
  hours: seedHours(startPartners),
  budget: seedBudget(startReference.budgetCategories),
  freelancer: seedFreelancerAndPurchaseOrders(startEvents, startPartners, startReference),
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

/** Resets every mock store to its seed (used between tests). */
export function resetMockDb(): void {
  db.partners = initialPartners();
  db.reference = initialReference();
  db.events = initialEvents(db.partners, db.reference);
  db.offers = seedOffers(db.events, db.partners);
  db.references = seedReferences();
  db.tasks = seedTasks();
  db.hours = seedHours(db.partners);
  db.budget = seedBudget(db.reference.budgetCategories);
  db.freelancer = seedFreelancerAndPurchaseOrders(db.events, db.partners, db.reference);
  resetImportStore();
  setMockSession(null);
}
