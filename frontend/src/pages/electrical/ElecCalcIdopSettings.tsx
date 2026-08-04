/**
 * Project Iдоп (max section start current) — required for sectioning (E2 / FE-27).
 */
import type { ReactNode } from 'react';
import { TltAlert, TltButton, TltNumberField } from '@/components/ui-kit';
import type { ProjectElectricalSettingsController } from '@/pages/electrical/useProjectElectricalSettings';
import './ElecCalcIdopSettings.css';

export type ElecCalcIdopSettingsProps = {
  settings: ProjectElectricalSettingsController;
  /** Scroll/focus target for empty-state CTA */
  formId?: string;
};

export function ElecCalcIdopSettings({
  settings,
  formId = 'elec-idop-settings',
}: ElecCalcIdopSettingsProps): ReactNode {
  const {
    isLoading,
    isError,
    refetch,
    draftIdop,
    onDraftChange,
    save,
    saving,
    idopMissing,
    isDirty,
    canMutate,
    nominalVoltage,
  } = settings;

  return (
    <div
      id={formId}
      className="elec-idop-settings"
      data-testid="elec-idop-settings"
    >
      {idopMissing && (
        <TltAlert
          tone="warning"
          className="electrical-alert-gap"
          title="Iдоп не задан"
          action={canMutate ? (
            <TltButton
              size="compact"
              variant="primary"
              onClick={() => {
                document.getElementById(`${formId}-input`)?.focus();
              }}
            >
              Задать Iдоп
            </TltButton>
          ) : undefined}
        >
          Без допустимого стартового тока секции (Iдоп) система не может
          рассчитать нагревательные секции. Укажите значение в амперах (настройка проекта)
          и сохраните, затем назначьте Самрег или пересчитайте.
        </TltAlert>
      )}

      {isError && (
        <TltAlert
          tone="danger"
          className="electrical-alert-gap"
          title="Не удалось загрузить электрические настройки"
          action={(
            <TltButton size="compact" onClick={() => void refetch()}>
              Повторить
            </TltButton>
          )}
        >
          Проверьте соединение и повторите запрос.
        </TltAlert>
      )}

      <div
        className="elec-idop-settings__form"
        data-testid="elec-idop-settings-form"
      >
        <div className="elec-idop-settings__fields">
          <div className="elec-idop-settings__field">
            <span className="workflow-params-label elec-idop-settings__label">
              U, В (норматив)
            </span>
            <TltNumberField
              aria-label="Напряжение питания"
              disabled
              readOnly
              value={nominalVoltage}
              className="electrical-type-control electrical-type-control--w76"
            />
          </div>
          <div className="elec-idop-settings__field">
            <span className="workflow-params-label elec-idop-settings__label">
              Допустимый стартовый ток секции Iдоп, А
            </span>
            <TltNumberField
              id={`${formId}-input`}
              aria-label="Допустимый стартовый ток секции"
              data-testid="elec-idop-input"
              disabled={!canMutate || isLoading || saving}
              min={0.001}
              step={0.1}
              value={draftIdop}
              onChange={onDraftChange}
              placeholder="например 13"
              className="electrical-type-control electrical-type-control--w120"
            />
          </div>
          {canMutate && (
            <TltButton
              variant="primary"
              size="compact"
              loading={saving}
              disabled={isLoading || !isDirty}
              onClick={save}
              data-testid="elec-idop-save"
            >
              Сохранить Iдоп
            </TltButton>
          )}
        </div>
        <p className="elec-idop-settings__hint">
          Настройка проекта. Нужна для нарезки длины кабеля на секции (Lток = Iдоп / Iст.уд),
          не для выбора марки ТТН/ТТВ/ТТХ.
        </p>
      </div>
    </div>
  );
}
