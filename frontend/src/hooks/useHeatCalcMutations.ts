import { useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  createObject,
  deleteObject,
  reorderObjects,
  updateObject,
} from '@/api/projects';
import { batchCalcElectrical } from '@/api/calculations';
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
 *   - batchCalc: пакетно выполнить электрорасчёт и перейти на шаг 2
 *
 * Все мутации инвалидируют кэш объектов проекта. add/edit показывают
 * осмысленное сообщение (success либо warning с причиной ошибки валидации).
 */
export function useHeatCalcMutations(
  projectId: string | undefined,
  onAddSuccess?: () => void,
  onEditSuccess?: () => void,
) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const invalidateObjects = () =>
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects'] });

  const add = useMutation({
    mutationFn: (payload: CreateObjectRequest) => createObject(projectId!, payload),
    onSuccess: (obj) => {
      invalidateObjects();
      notifyObjectResult(obj, 'added');
      onAddSuccess?.();
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
      onEditSuccess?.();
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
      onEditSuccess?.();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const batchCalc = useMutation({
    mutationFn: () => batchCalcElectrical(projectId!),
    onSuccess: (res) => {
      qc.invalidateQueries({
        queryKey: ['project', projectId, 'electrical-calcs'],
      });
      if (res.errors.length > 0) {
        message.warning(
          `Рассчитано: ${res.calculated}. Пропущено: ${res.skipped}. Проверьте параметры объектов.`,
        );
      } else {
        message.success(`Электрорасчёт выполнен для ${res.calculated} объектов`);
      }
      navigate(ROUTES.elecCalc);
    },
    onError: (e: Error) => message.error(e.message),
  });

  return { add, edit, remove, reorder, batchCalc };
}
