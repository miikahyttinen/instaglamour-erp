import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../../api/endpoints';
import type { Id, TaskCreate, TaskListQuery, TaskUpdate } from '../../api/types';

export const tasksKey = ['tasks'] as const;

export function useTasks(query: TaskListQuery) {
  return useQuery({
    queryKey: [...tasksKey, query],
    queryFn: () => tasksApi.list(query),
  });
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tasksKey });
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (body: TaskCreate) => tasksApi.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, body }: { id: Id; body: TaskUpdate }) => tasksApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: Id) => tasksApi.remove(id),
    onSuccess: invalidate,
  });
}
