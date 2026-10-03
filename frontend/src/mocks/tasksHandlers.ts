// Mock handlers + synthetic data for the Tasks section of docs/api-contract.md (UC-017).
// Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type { Task, TaskCreate, TaskUpdate } from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

interface StoredTask extends Omit<Task, 'overdue'> {
  createdAt: number;
}

const PARTNER_A = '00000000-0000-4000-8000-00000000000a';
const PARTNER_B = '00000000-0000-4000-8000-00000000000b';

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

function initialTasks(): StoredTask[] {
  const base = Date.UTC(2026, 0, 1);
  return [
    {
      id: '00000000-0000-4000-8000-000000000501',
      title: 'Task 1',
      description: 'Description 1',
      dueDate: isoOffset(-3),
      ownerId: PARTNER_A,
      status: 'OPEN',
      completedAt: null,
      createdAt: base,
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      title: 'Task 2',
      description: null,
      dueDate: isoOffset(7),
      ownerId: PARTNER_B,
      status: 'OPEN',
      completedAt: null,
      createdAt: base + 1,
    },
    {
      id: '00000000-0000-4000-8000-000000000503',
      title: 'Task 3',
      description: null,
      dueDate: null,
      ownerId: PARTNER_A,
      status: 'OPEN',
      completedAt: null,
      createdAt: base + 2,
    },
    {
      id: '00000000-0000-4000-8000-000000000504',
      title: 'Task 4',
      description: null,
      dueDate: isoOffset(-10),
      ownerId: PARTNER_B,
      status: 'DONE',
      completedAt: new Date(base).toISOString(),
      createdAt: base + 3,
    },
  ];
}

export const tasksDb: { tasks: StoredTask[]; nextId: number } = { tasks: initialTasks(), nextId: 1 };

/** Resets the task mock store (call in tests' beforeEach). */
export function resetTasksMock(): void {
  tasksDb.tasks = initialTasks();
  tasksDb.nextId = 1;
}

function toDto({ createdAt: _createdAt, ...task }: StoredTask, today: string): Task {
  return { ...task, overdue: task.status === 'OPEN' && task.dueDate !== null && task.dueDate < today };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validate(body: TaskCreate | TaskUpdate, isCreate: boolean): Record<string, FieldCode> {
  const fields: Record<string, FieldCode> = {};
  if (isCreate || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) fields.title = 'REQUIRED';
    else if (title.length > 500) fields.title = 'TOO_LONG';
  }
  if (body.dueDate != null && !ISO_DATE.test(body.dueDate)) fields.dueDate = 'INVALID_DATE';
  if (body.description != null && body.description.length > 5000) fields.description = 'TOO_LONG';
  if (body.ownerId != null && !db.partners.some((p) => p.id === body.ownerId)) {
    fields.ownerId = 'UNKNOWN_REFERENCE';
  }
  if ('status' in body && body.status !== undefined && body.status !== 'OPEN' && body.status !== 'DONE') {
    fields.status = 'INVALID_VALUE';
  }
  return fields;
}

const emptyToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

export const tasksHandlers = [
  http.get('/api/tasks', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const params = new URL(request.url).searchParams;
    const status = params.get('status') ?? 'OPEN';
    const ownerId = params.get('ownerId');
    if (!['OPEN', 'DONE', 'ALL'].includes(status)) {
      return validationError({ status: 'INVALID_VALUE' });
    }
    const today = todayIso();
    const list = tasksDb.tasks
      .filter((t) => status === 'ALL' || t.status === status)
      .filter((t) => !ownerId || t.ownerId === ownerId)
      .map((t) => ({ stored: t, dto: toDto(t, today) }))
      .sort((a, b) => {
        if (a.dto.overdue !== b.dto.overdue) return a.dto.overdue ? -1 : 1;
        const da = a.dto.dueDate;
        const dbb = b.dto.dueDate;
        if (da !== dbb) {
          if (da === null) return 1;
          if (dbb === null) return -1;
          return da < dbb ? -1 : 1;
        }
        return a.stored.createdAt - b.stored.createdAt;
      })
      .map((x) => x.dto);
    return HttpResponse.json(list);
  }),

  http.post('/api/tasks', async ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body = (await request.json()) as TaskCreate;
    const fields = validate(body, true);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const task: StoredTask = {
      id: `00000000-0000-4000-8000-${String(900000000000 + tasksDb.nextId++)}`,
      title: body.title.trim(),
      description: emptyToNull(body.description),
      dueDate: body.dueDate ?? null,
      ownerId: body.ownerId ?? me.id,
      status: 'OPEN',
      completedAt: null,
      createdAt: Date.now(),
    };
    tasksDb.tasks.push(task);
    return HttpResponse.json(toDto(task, todayIso()), { status: 201 });
  }),

  http.patch('/api/tasks/:id', async ({ request, params }) => {
    if (!currentPartner()) return unauthenticated();
    const body = (await request.json()) as TaskUpdate;
    const fields = validate(body, false);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const task = tasksDb.tasks.find((t) => t.id === params.id);
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found');
    if (body.title !== undefined) task.title = body.title.trim();
    if (body.ownerId !== undefined) task.ownerId = body.ownerId;
    if (body.dueDate !== undefined) task.dueDate = body.dueDate;
    if (body.description !== undefined) task.description = emptyToNull(body.description);
    if (body.status !== undefined && body.status !== task.status) {
      task.status = body.status;
      task.completedAt = body.status === 'DONE' ? new Date().toISOString() : null;
    }
    return HttpResponse.json(toDto(task, todayIso()));
  }),

  http.delete('/api/tasks/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const index = tasksDb.tasks.findIndex((t) => t.id === params.id);
    if (index < 0) return errorResponse(404, 'NOT_FOUND', 'Task not found');
    tasksDb.tasks.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
