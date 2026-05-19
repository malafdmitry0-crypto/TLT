import { useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import {
  createObject,
  deleteObject,
  updateObject,
} from '@/api/projects';
import type { CreateObjectRequest, ProjectObject } from '@/types/project';

/**
 * Показывает пользователю результат add/edit-операции: success если расчёт
 * прошёл, warning если объект сохранён, но не валиден. Детали ошибок
 * показываются в панели параметров объекта, а не в глобальном toast.
 */
function notifyObjectResult(obj: ProjectObject, action: 'added' | 'updated') {
  const verb = action === 'added' ? 'добавлен' : 'обновлён';
  const past = action === 'added' ? 'рассчитан' : 'пересчитан';
  if (!obj.is_valid) {
    message.warning(
      `Объект ${verb}, но расчёт не выполнен. Проверьте панель параметров.`,
      10,
    );
  } else {
    message.success(`Объект ${verb} и ${past}`);
  }
}

/**
 * Все мутации страницы «Расчёт теплопотерь» (HeatCalcPage):
 *   - add:       добавить объект
 *   - edit:      обновить параметры объекта
 *   - remove:    удалить объект
 *
 * Все мутации инвалидируют кэш объектов проекта. add/edit показывают
 * осмысленное сообщение (success либо warning с причиной ошибки валидации).
 */
export function useHeatCalcMutations(
  projectId: string | undefined,
  onAddSuccess?: (obj: ProjectObject) => void,
  onEditSuccess?: (obj: ProjectObject) => void,
  onRemoveSuccess?: () => void,
) {
  const qc = useQueryClient();

  const invalidateObjects = () => {
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'query'] });
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
    qc.invalidateQueries({ queryKey: ['spec', projectId] });
  };

  const add = useMutation({
    mutationFn: (payload: CreateObjectRequest) => createObject(projectId!, payload),
    onSuccess: (obj) => {
      invalidateObjects();
      notifyObjectResult(obj, 'added');
      onAddSuccess?.(obj);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const edit = useMutation({
    mutationFn: ({
      objectId,
      version,
      params,
    }: {
      objectId: string;
      version: number;
      params: Record<string, unknown>;
    }) => updateObject(projectId!, objectId, { version, params }),
    onSuccess: (obj) => {
      invalidateObjects();
      notifyObjectResult(obj, 'updated');
      onEditSuccess?.(obj);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (objectId: string) => deleteObject(projectId!, objectId),
    onSuccess: () => {
      invalidateObjects();
      message.success('Объект удалён');
      onRemoveSuccess?.();
    },
    onError: (e: Error) => message.error(e.message),
  });

  return { add, edit, remove };
}
