/**
 * Групповая корректировка объектов — кейс 1 §5.8.
 *
 * За одну операцию меняется ОДИН параметр у всех выбранных объектов.
 * Операция всё-или-ничего: если значение недопустимо хотя бы для одного
 * объекта, бэкенд откатывает транзакцию и возвращает 422 с перечнем
 * проблемных объектов — их и показываем, данные при этом не изменены.
 */
import { useMemo, useState } from 'react';
import {
  TltAlert, TltButton, TltModal, TltNumberField, TltSelect, TltTextField,
} from '@/components/ui-kit';
import './heat-group-update-modal.css';
import {
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldLabel,
  getHeatCalcFormFieldIds,
} from '@/domain/heatCalcFields';
import type { HeatCalcObjectType } from '@/types/project';
import type { GroupUpdateProblem } from '@/api/projects';

export interface HeatCalcGroupUpdateModalProps {
  open: boolean;
  objectType: HeatCalcObjectType;
  selectedCount: number;
  applying: boolean;
  problems: GroupUpdateProblem[];
  errorMessage: string | null;
  onApply: (param: string, value: unknown) => void;
  onClose: () => void;
}

/** Вычисляемые поля менять нельзя — они результат расчёта, а не ввод. */
function editableFieldIds(objectType: HeatCalcObjectType): string[] {
  return getHeatCalcFormFieldIds(objectType).filter((id) => {
    const input = getHeatCalcFieldInputConfig(id, objectType);
    return input?.type && input.type !== 'computed';
  });
}

export default function HeatCalcGroupUpdateModal({
  open,
  objectType,
  selectedCount,
  applying,
  problems,
  errorMessage,
  onApply,
  onClose,
}: HeatCalcGroupUpdateModalProps) {
  const [param, setParam] = useState<string | undefined>(undefined);
  const [value, setValue] = useState<unknown>(undefined);

  const options = useMemo(
    () => editableFieldIds(objectType).map((id) => ({
      value: id,
      label: getHeatCalcFieldLabel(id, { context: 'form', objectType }),
    })),
    [objectType],
  );
  const input = param ? getHeatCalcFieldInputConfig(param, objectType) : null;

  const handleParam = (next: string | number | null) => {
    setParam(next == null ? undefined : String(next));
    setValue(undefined); // значение прежнего параметра к новому неприменимо
  };

  return (
    <TltModal
      open={open}
      title="Групповая корректировка"
      onCancel={onClose}
      afterClose={() => { setParam(undefined); setValue(undefined); }}
      footer={[
        <TltButton key="cancel" onClick={onClose}>Отмена</TltButton>,
        <TltButton
          key="apply"
          variant="primary"
          loading={applying}
          disabled={!param || value === undefined || value === ''}
          onClick={() => param && onApply(param, value)}
        >
          Применить
        </TltButton>,
      ]}
    >
      <div className="heat-group-update">
        <p className="heat-group-update__note">Выбрано объектов: {selectedCount}</p>

        <label>
          <span className="heat-group-update__label">Параметр</span>
          <TltSelect
            data-testid="group-update-param"
            value={param}
            options={options}
            placeholder="Выберите параметр"
            onChange={handleParam}
          />
        </label>

        {param && (
          <label>
            <span className="heat-group-update__label">Новое значение</span>
            {input?.type === 'number' ? (
              <TltNumberField
                data-testid="group-update-value"
                value={value as number | undefined}
                unit={input.unit}
                min={input.min}
                max={input.max}
                onChange={(next) => setValue(next)}
              />
            ) : input?.options?.length ? (
              <TltSelect
                data-testid="group-update-value"
                value={value as string | undefined}
                options={input.options.map((option) => ({
                  value: String(option.value),
                  label: String(option.label ?? option.value),
                }))}
                onChange={(next) => setValue(next)}
              />
            ) : (
              <TltTextField
                data-testid="group-update-value"
                value={value as string | undefined}
                onChange={(next) => setValue(next)}
              />
            )}
          </label>
        )}

        <p className="heat-group-update__note">За одну операцию изменяется один параметр (§5.8).</p>

        {errorMessage && (
          <TltAlert tone="danger" title={errorMessage}>
            {problems.length > 0 && (
              <ul className="heat-group-update__problems">
                {problems.map((problem) => (
                  <li key={problem.object_id}>
                    {problem.name || problem.object_id}: {problem.error}
                  </li>
                ))}
              </ul>
            )}
          </TltAlert>
        )}
      </div>
    </TltModal>
  );
}
