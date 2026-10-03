/**
 * Gig test fixtures. Synthetic data only (BR-090); money is 1000 or multiples of 10000 cents.
 */
import type { FastifyInstance } from 'fastify';
import { SETTING_KEYS } from '../src/domain/enums.js';
import { createPartner, login, testApp, testDb } from './helpers.js';

export const FEES = {
  office: 10000,
  sales: 10000,
  production: 10000,
  loadInDeduction: 10000,
};

export async function setSetting(key: string, valueCents: number) {
  await testDb().setting.upsert({ where: { key }, create: { key, valueCents }, update: { valueCents } });
}

export async function seedGigWorld() {
  const db = testDb();
  const a = await createPartner('Partner A', 'partner.a@example.com');
  const b = await createPartner('Partner B', 'partner.b@example.com');
  const c = await createPartner('Partner C', 'partner.c@example.com');
  const p1 = await db.person.create({ data: { name: 'Person 1' } });
  const p2 = await db.person.create({ data: { name: 'Person 2' } });
  const p3 = await db.person.create({ data: { name: 'Person 3' } });
  await setSetting(SETTING_KEYS.officeDefault, FEES.office);
  await setSetting(SETTING_KEYS.salesDefault, FEES.sales);
  await setSetting(SETTING_KEYS.productionDefault, FEES.production);
  await setSetting(SETTING_KEYS.loadInDeduction, FEES.loadInDeduction);
  const templateA = await db.lineupTemplate.create({
    data: {
      name: 'Template A',
      roles: {
        create: [
          { position: 0, role: 'VOC', defaultFeeCents: 30000 },
          { position: 1, role: 'BASS', defaultFeeCents: 20000 },
        ],
      },
    },
  });
  return { a, b, c, p1, p2, p3, templateA };
}

export type World = Awaited<ReturnType<typeof seedGigWorld>>;

export interface Session {
  app: FastifyInstance;
  cookie: string;
  world: World;
}

export async function startSession(): Promise<Session> {
  const world = await seedGigWorld();
  const app = await testApp();
  const cookie = await login(app, 'partner.a@example.com');
  return { app, cookie, world };
}

export function gigBody(world: World, overrides: Record<string, unknown> = {}) {
  return {
    startDate: '2026-05-01',
    endDate: null,
    lineupTemplateId: world.templateA.id,
    lineupName: null,
    venue: 'Venue X',
    technicalSetup: ['HOUSE_TECH'],
    sellerId: world.a.id,
    producerId: world.b.id,
    priceCents: 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
    ...overrides,
  };
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** A request as the signed-in partner. */
export function call(s: Session, method: Method, url: string, payload?: unknown) {
  return s.app.inject({
    method,
    url,
    headers: { cookie: s.cookie },
    ...(payload !== undefined && { payload: payload as object }),
  });
}

export async function createGig(s: Session, overrides: Record<string, unknown> = {}) {
  const res = await call(s, 'POST', '/api/gigs', gigBody(s.world, overrides));
  if (res.statusCode !== 201) throw new Error(`create gig failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

export async function history(s: Session, gigId: string) {
  const res = await call(s, 'GET', `/api/gigs/${gigId}/history`);
  if (res.statusCode !== 200) throw new Error(`history failed: ${res.statusCode} ${res.body}`);
  return res.json() as { type: string; reason: string | null; partnerId: string; details: Record<string, unknown> }[];
}

export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
