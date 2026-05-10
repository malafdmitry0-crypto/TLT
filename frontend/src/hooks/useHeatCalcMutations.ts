import { useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  createObject,
  deleteObject,
  reorderObjects,
  updateObject,
} from '@/api/projects';
import { enqueueElectricalBatchJob } from '@/api/calculations';
import { ROUTES } from '@/routes/routes';
import type { CreateObjectRequest, ProjectObject } from '@/types/project';

/**
 * Возвращает осмысленный текст ошибки для объекта, у которого is_valid === false.
 * Поле validation_errors.error — нетипизированный JSON из бэкенда (Python dict).
 */
function extractValidationError(obj: ProjectObject): string {
  return (
    (obj.validation_errors?.error as string | undefined) ??
    'Расчёт не выполнен: проверьте параметры объекта'
  );
}

/**
 * Показывает пользователю результат add/edit-операции: success если расчёт
 * прошёл, warning с причиной если объект сохранён, но не валиден.
 */
function notifyObjectResult(obj: ProjectObject, action: 'added' | 'updated') {
  const verb = action === 'added' ? 'добавлен' : 'обновлён';
  const past = action === 'added' ? 'рассчитан' : 'пересчитан';
  if (!obj.is_valid) {
    message.warning(
      `Объект ${verb}, но расчёт не выполнен: ${extractValidationError(obj)}`,
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
 *   - reorder:   сменить порядок объектов (drag-and-drop)
 *   - batchCalc: поставить пакетный электрорасчёт в очередь и перейти на шаг 2
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
  const navigate = useNavigate();

  const invalidateObjects = () => {
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'query'] });
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
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
      params,
    }: {
      objectId: string;
      params: Record<string, unknown>;
    }) => updateObject(projectId!, objectId, { params }),
    onSuccess: (obj) => {
      invalidateObjects();
      notifyObjectResult(obj, 'updated');
      onEditSuccess?.(obj);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: (order: string[]) => reorderObjects(projectId!, order),
    onSuccess: invalidateObjects,
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

  const batchCalc = useMutation({
    mutationFn: () => enqueueElectricalBatchJob(projectId!),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['calc-job', task.id] });
      message.info('Электрорасчёт поставлен в очередь');
      navigate(ROUTES.elecCalc, { state: { activeJobId: task.id } });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return { add, edit, remove, reorder, batchCalc };
}
