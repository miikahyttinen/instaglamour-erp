/** Task endpoints (UC-017, BR-030). Synthetic data only. */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  vi.useRealTimers();
  await s.app.close();
});
afterAll(closeTestDb);

async function createTask(payload: Record<string, unknown>): Promise<Json> {
  // With a frozen clock, step it so creation times differ (the last sort key).
  if (vi.isFakeTimers()) vi.setSystemTime(Date.now() + 1000);
  const res = await call(s, 'POST', '/api/tasks', payload);
  if (res.statusCode !== 201) throw new Error(`create task failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

/** Freeze "today" (Helsinki) while letting the database clock run. */
function setToday(isoInstant: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(isoInstant));
}

describe('POST /api/tasks', () => {
  it('creates an OPEN task owned by me by default', async () => {
    const res = await call(s, 'POST', '/api/tasks', { title: ' Task 1 ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(String),
      title: 'Task 1',
      description: null,
      dueDate: null,
      ownerId: s.world.a.id,
      status: 'OPEN',
      completedAt: null,
      overdue: false,
    });
  });

  it('takes an owner, due date and description', async () => {
    const task = await createTask({ title: 'Task 1', ownerId: s.world.b.id, dueDate: '2099-06-01', description: 'Text 1' });
    expect(task).toMatchObject({ ownerId: s.world.b.id, dueDate: '2099-06-01', description: 'Text 1', overdue: false });
  });

  it('validates input', async () => {
    const missing = await call(s, 'POST', '/api/tasks', { title: '  ', dueDate: '2026-02-30', description: 'x'.repeat(5001) });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.fields).toEqual({ title: 'REQUIRED', dueDate: 'INVALID_DATE', description: 'TOO_LONG' });

    for (const ownerId of [UNKNOWN_ID, 'nope', '']) {
      const res = await call(s, 'POST', '/api/tasks', { title: 'Task 1', ownerId });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toEqual({ ownerId: 'UNKNOWN_REFERENCE' });
    }
    // A person who is not a partner can't own a task
    const person = await call(s, 'POST', '/api/tasks', { title: 'Task 1', ownerId: s.world.p1.id });
    expect(person.json().error.fields).toEqual({ ownerId: 'UNKNOWN_REFERENCE' });
  });
});

describe('GET /api/tasks', () => {
  it('shows OPEN tasks: overdue first, then due date with nulls last, then creation order', async () => {
    setToday('2026-06-14T21:30:00.000Z'); // 2026-06-15 in Helsinki
    const noDate1 = await createTask({ title: 'Task no date 1' });
    const later = await createTask({ title: 'Task later', dueDate: '2026-07-01' });
    const today = await createTask({ title: 'Task today', dueDate: '2026-06-15' });
    const overdueNew = await createTask({ title: 'Task overdue new', dueDate: '2026-06-14' });
    const overdueOld = await createTask({ title: 'Task overdue old', dueDate: '2026-01-01' });
    const noDate2 = await createTask({ title: 'Task no date 2' });
    const sameDay = await createTask({ title: 'Task later 2', dueDate: '2026-07-01' });
    const done = await createTask({ title: 'Task done', dueDate: '2026-01-01' });
    await call(s, 'PATCH', `/api/tasks/${done.id}`, { status: 'DONE' });

    const res = await call(s, 'GET', '/api/tasks');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.map((t: { id: string }) => t.id)).toEqual([overdueOld.id, overdueNew.id, today.id, later.id, sameDay.id, noDate1.id, noDate2.id]);
    expect(body.map((t: { overdue: boolean }) => t.overdue)).toEqual([true, true, false, false, false, false, false]);
  });

  it('filters by status and owner', async () => {
    const mine = await createTask({ title: 'Task 1' });
    const theirs = await createTask({ title: 'Task 2', ownerId: s.world.b.id });
    const done = await createTask({ title: 'Task 3', dueDate: '2000-01-01' });
    await call(s, 'PATCH', `/api/tasks/${done.id}`, { status: 'DONE' });

    const ids = async (url: string) => (await call(s, 'GET', url)).json<{ id: string }[]>().map((t) => t.id);
    expect(await ids('/api/tasks?status=DONE')).toEqual([done.id]);
    expect((await call(s, 'GET', '/api/tasks?status=DONE')).json()[0].overdue).toBe(false); // DONE is never overdue
    expect(new Set(await ids('/api/tasks?status=ALL'))).toEqual(new Set([mine.id, theirs.id, done.id]));
    expect(await ids(`/api/tasks?ownerId=${s.world.b.id}`)).toEqual([theirs.id]);
    expect(await ids(`/api/tasks?status=ALL&ownerId=${s.world.a.id}`)).toEqual([done.id, mine.id]);
  });

  it('rejects invalid filters', async () => {
    const res = await call(s, 'GET', '/api/tasks?status=LATER&ownerId=x');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ status: 'INVALID_VALUE', ownerId: 'INVALID_VALUE' });
  });
});

describe('PATCH /api/tasks/{id}', () => {
  it('DONE sets completedAt; OPEN clears it', async () => {
    const task = await createTask({ title: 'Task 1', dueDate: '2000-01-01' });
    expect(task.overdue).toBe(true);
    const done = await call(s, 'PATCH', `/api/tasks/${task.id}`, { status: 'DONE' });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'DONE', completedAt: expect.stringMatching(/Z$/), overdue: false });

    // DONE again keeps the original completion time
    const again = await call(s, 'PATCH', `/api/tasks/${task.id}`, { status: 'DONE' });
    expect(again.json().completedAt).toBe(done.json().completedAt);

    const reopened = await call(s, 'PATCH', `/api/tasks/${task.id}`, { status: 'OPEN' });
    expect(reopened.json()).toMatchObject({ status: 'OPEN', completedAt: null, overdue: true });
  });

  it('edits fields and clears optional ones with null', async () => {
    const task = await createTask({ title: 'Task 1', dueDate: '2099-01-01', description: 'Text 1' });
    const res = await call(s, 'PATCH', `/api/tasks/${task.id}`, { title: 'Task 2', ownerId: s.world.c.id, dueDate: null, description: null });
    expect(res.json()).toEqual({ ...task, title: 'Task 2', ownerId: s.world.c.id, dueDate: null, description: null });
  });

  it('a no-op returns 200 and writes nothing', async () => {
    const task = await createTask({ title: 'Task 1', dueDate: '2099-01-01' });
    const before = await testDb().task.findUniqueOrThrow({ where: { id: task.id } });
    const res = await call(s, 'PATCH', `/api/tasks/${task.id}`, { title: 'Task 1', dueDate: '2099-01-01', status: 'OPEN' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(task);
    expect((await testDb().task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt).toEqual(before.updatedAt);
  });

  it('validates (400) before existence (404)', async () => {
    const invalid = await call(s, 'PATCH', `/api/tasks/${UNKNOWN_ID}`, { title: '', status: 'LATER', ownerId: null });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields).toEqual({ title: 'REQUIRED', status: 'INVALID_VALUE', ownerId: 'REQUIRED' });
    const unknownOwner = await call(s, 'PATCH', `/api/tasks/${UNKNOWN_ID}`, { ownerId: UNKNOWN_ID });
    expect(unknownOwner.statusCode).toBe(400);
    expect(unknownOwner.json().error.fields).toEqual({ ownerId: 'UNKNOWN_REFERENCE' });
    const missing = await call(s, 'PATCH', `/api/tasks/${UNKNOWN_ID}`, { title: 'Task 1' });
    expect(missing.statusCode).toBe(404);
  });
});

describe('DELETE /api/tasks/{id}', () => {
  it('deletes; unknown → 404', async () => {
    const task = await createTask({ title: 'Task 1' });
    const res = await call(s, 'DELETE', `/api/tasks/${task.id}`);
    expect(res.statusCode).toBe(204);
    expect(await testDb().task.count()).toBe(0);
    expect((await call(s, 'DELETE', `/api/tasks/${task.id}`)).statusCode).toBe(404);
    expect((await call(s, 'DELETE', '/api/tasks/not-a-uuid')).statusCode).toBe(404);
  });
});
