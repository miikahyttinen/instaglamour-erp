/** Task endpoints (docs/api-contract.md "Tasks"; UC-017, BR-030). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { dateFromIso, isoFromDate, todayIso } from '../domain/dates.js';
import type { Task } from '../generated/prisma/client.js';
import { notFound, parseInput, validationError } from '../http/errors.js';
import { isoDate, LONG_TEXT_MAX, oneOf, optionalText, requiredText } from '../events/schemas.js';
import { isUuid } from '../events/store.js';

type IdParams = { Params: { id: string } };

const TASK_STATUSES = ['OPEN', 'DONE'] as const;

const listQuery = z.object({
  status: z.enum([...TASK_STATUSES, 'ALL'], { message: 'INVALID_VALUE' }).default('OPEN'),
  ownerId: z.string().refine(isUuid, { message: 'INVALID_VALUE' }).optional(),
});

const createBody = z.object({
  title: requiredText(),
  ownerId: z.string().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  description: optionalText(LONG_TEXT_MAX),
});

const updateBody = z.object({
  title: requiredText().optional(),
  ownerId: z.string().optional(),
  dueDate: isoDate.nullable().optional(),
  description: optionalText(LONG_TEXT_MAX),
  status: oneOf(TASK_STATUSES).optional(),
});

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  ownerId: string;
  status: 'OPEN' | 'DONE';
  completedAt: string | null;
  overdue: boolean;
}

/** BR-030: overdue = OPEN and due date before today (Helsinki). */
export function toTaskDto(task: Task, today: string): TaskDto {
  const dueDate = task.dueDate ? isoFromDate(task.dueDate) : null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate,
    ownerId: task.ownerId,
    status: task.status,
    completedAt: task.completedAt?.toISOString() ?? null,
    overdue: task.status === 'OPEN' && dueDate !== null && dueDate < today,
  };
}

/** Contract order: overdue first, then due date (nulls last), then creation time. */
function compareTasks(a: { dto: TaskDto; task: Task }, b: { dto: TaskDto; task: Task }): number {
  if (a.dto.overdue !== b.dto.overdue) return a.dto.overdue ? -1 : 1;
  const da = a.dto.dueDate;
  const dbb = b.dto.dueDate;
  if (da !== dbb) {
    if (da === null) return 1;
    if (dbb === null) return -1;
    return da < dbb ? -1 : 1;
  }
  return a.task.createdAt.getTime() - b.task.createdAt.getTime() || (a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0);
}

export function taskRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /**
   * BR-111: a new owner must be an active partner. `currentOwnerId` (the task's owner when
   * updating) stays valid even if that partner has been removed since.
   */
  const assertOwnerExists = async (ownerId: string, currentOwnerId?: string) => {
    if (ownerId === currentOwnerId) return;
    const exists = isUuid(ownerId) && (await db.partner.count({ where: { id: ownerId, active: true } })) > 0;
    if (!exists) throw validationError({ ownerId: 'UNKNOWN_REFERENCE' });
  };

  const requireTask = async (id: string) => {
    const task = isUuid(id) ? await db.task.findUnique({ where: { id } }) : null;
    if (!task) throw notFound('Task not found');
    return task;
  };

  app.get('/api/tasks', async (request) => {
    const query = parseInput(listQuery, request.query);
    const today = todayIso();
    const tasks = await db.task.findMany({
      where: {
        ...(query.status !== 'ALL' && { status: query.status }),
        ...(query.ownerId && { ownerId: query.ownerId }),
      },
    });
    return tasks
      .map((task) => ({ task, dto: toTaskDto(task, today) }))
      .sort(compareTasks)
      .map((t) => t.dto);
  });

  app.post('/api/tasks', async (request, reply) => {
    const me = request.requirePartner();
    const body = parseInput(createBody, request.body);
    const ownerId = body.ownerId ?? me.id;
    if (body.ownerId != null) await assertOwnerExists(ownerId);
    const task = await db.task.create({
      data: {
        title: body.title,
        ownerId,
        dueDate: body.dueDate ? dateFromIso(body.dueDate) : null,
        description: body.description ?? null,
      },
    });
    return reply.status(201).send(toTaskDto(task, todayIso()));
  });

  app.patch<IdParams>('/api/tasks/:id', async (request) => {
    const body = parseInput(updateBody, request.body);
    // Unknown owner id → 400 before the task lookup (check order); an inactive one is only
    // allowed when it is the task's current owner, which needs the task.
    if (body.ownerId !== undefined && !(isUuid(body.ownerId) && (await db.partner.count({ where: { id: body.ownerId } })) > 0))
      throw validationError({ ownerId: 'UNKNOWN_REFERENCE' });
    const task = await requireTask(request.params.id);
    if (body.ownerId !== undefined) await assertOwnerExists(body.ownerId, task.ownerId);

    const data: Partial<Pick<Task, 'title' | 'ownerId' | 'dueDate' | 'description' | 'status' | 'completedAt'>> = {};
    if (body.title !== undefined && body.title !== task.title) data.title = body.title;
    if (body.ownerId !== undefined && body.ownerId !== task.ownerId) data.ownerId = body.ownerId;
    if (body.dueDate !== undefined) {
      const current = task.dueDate ? isoFromDate(task.dueDate) : null;
      if (body.dueDate !== current) data.dueDate = body.dueDate ? dateFromIso(body.dueDate) : null;
    }
    if (body.description !== undefined && body.description !== task.description) data.description = body.description;
    // DONE sets the completion time; reopening clears it (UC-017 AC-2).
    if (body.status !== undefined && body.status !== task.status) {
      data.status = body.status;
      data.completedAt = body.status === 'DONE' ? new Date() : null;
    }

    const updated = Object.keys(data).length > 0 ? await db.task.update({ where: { id: task.id }, data }) : task;
    return toTaskDto(updated, todayIso());
  });

  app.delete<IdParams>('/api/tasks/:id', async (request, reply) => {
    const task = await requireTask(request.params.id);
    await db.task.delete({ where: { id: task.id } });
    return reply.status(204).send();
  });
}
