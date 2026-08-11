/**
 * Project Iдоп (max section start current) — required for sectioning (E2 / FE-27).
 */
import type { ReactNode } from 'react';
import { TltAlert, TltButton, TltNumberField } from '@/components/ui-kit';
import type { ProjectElectricalSettingsController } from '@/pages/electrical/useProjectElectricalSettings';
import './ElecCalcIdopSettings.css';

export type ElecCalcIdopSettingsProps = {
  settings: ProjectElectricalSettingsController;
  /** Stable id base for the settings form and its input. */
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
    validationError,
    canSave,
    canMutate,
  } = settings;

  return (
    <div
      id={formId}
      className="elec-idop-settings"
      data-testid="elec-idop-settings"
    >
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
              Iдоп проекта — допустимый стартовый ток одной секции, А
            </span>
            <TltNumberField
              id={`${formId}-input`}
              aria-label="Iдоп проекта — допустимый стартовый ток одной секции, А"
              data-testid="elec-idop-input"
              disabled={!canMutate || isLoading || saving}
              required
              status={validationError ? 'error' : ''}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? `${formId}-error` : undefined}
              min={0.001}
              step={0.1}
              value={draftIdop}
              onChange={onDraftChange}
              placeholder="например 13"
              className="electrical-type-control electrical-type-control--w118"
            />
          </div>
          {canMutate && (
            <TltButton
              variant="primary"
              size="compact"
              loading={saving}
              disabled={!canSave}
              onClick={save}
              data-testid="elec-idop-save"
            >
              Сохранить Iдоп
            </TltButton>
          )}
        </div>
        {validationError && (
          <span id={`${formId}-error`} className="elec-idop-settings__error" role="alert">
            {validationError}
          </span>
        )}
      </div>
    </div>
  );
}
