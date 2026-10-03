// In-memory mock of tasks (UC-017). Synthetic data only (BR-090).
// This file does not import mocks/data.ts (no import cycle).
import type { Task } from '../api/types';
import { todayIso } from '../lib/format';

export interface StoredTask extends Omit<Task, 'overdue'> {
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

export interface TasksState {
  tasks: StoredTask[];
  nextId: number;
}

export function seedTasks(): TasksState {
  return { tasks: initialTasks(), nextId: 1 };
}
