/**
 * Групповая корректировка объектов — кейс 1 §5.8.
 *
 * Бэкенд выполняет операцию всё-или-ничего: при недопустимом значении хотя бы
 * для одного объекта транзакция откатывается и возвращается 422 с перечнем
 * проблемных объектов. Хук хранит этот перечень для показа в модалке и ничего
 * не меняет локально до успешного ответа.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { groupUpdateObjects, type GroupUpdateProblem } from '@/api/projects';

interface GroupUpdateErrorDetail {
  message?: string;
  objects?: GroupUpdateProblem[];
}

function readErrorDetail(error: unknown): GroupUpdateErrorDetail {
  const response = (error as { response?: { data?: { detail?: unknown } } }).response;
  const detail = response?.data?.detail;
  if (typeof detail === 'string') return { message: detail };
  if (detail && typeof detail === 'object') return detail as GroupUpdateErrorDetail;
  return {};
}

export function useHeatCalcGroupUpdate(projectId: string | undefined, selectedIds: string[]) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [problems, setProblems] = useState<GroupUpdateProblem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setProblems([]);
    setErrorMessage(null);
  }, []);

  const apply = useCallback(async (param: string, value: unknown) => {
    if (!projectId || selectedIds.length === 0) return;
    setApplying(true);
    setProblems([]);
    setErrorMessage(null);
    try {
      await groupUpdateObjects(projectId, selectedIds, param, value);
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      close();
    } catch (error) {
      const detail = readErrorDetail(error);
      setProblems(detail.objects ?? []);
      setErrorMessage(detail.message ?? 'Не удалось применить значение');
    } finally {
      setApplying(false);
    }
  }, [close, projectId, queryClient, selectedIds]);

  return {
    groupUpdateOpen: open,
    groupUpdateApplying: applying,
    groupUpdateProblems: problems,
    groupUpdateError: errorMessage,
    openGroupUpdate: () => setOpen(true),
    closeGroupUpdate: close,
    applyGroupUpdate: apply,
  };
}
