/** Project I доп: empty uses the catalog; a number is a project override. */
import type { ReactNode } from 'react';
import {
  CompactField,
  CompactFieldGrid,
  TltAlert,
  TltButton,
  TltNumberField,
} from '@/components/ui-kit';
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
    draftMode,
    onModeChange,
    onDraftChange,
    save,
    saving,
    validationError,
    canSave,
    canMutate,
  } = settings;
  const controlsDisabled = !canMutate || isLoading || isError || saving;
  const settingsReady = !isLoading && !isError;
  const helpId = `${formId}-help`;
  const errorId = `${formId}-error`;
  const helpText = draftMode === 'auto'
    ? 'По каталогу для каждого объекта: I доп = Lмакс × Iст.уд. Введите число для единого предела.'
    : 'Ручной предел применяется ко всем объектам проекта. Очистите поле и сохраните, чтобы вернуться к каталогу.';

  const handleDraftChange = (value: number | null) => {
    onDraftChange(value);
    onModeChange(value == null ? 'auto' : 'manual');
  };

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
        {isLoading && <span role="status">Загрузка настроек I доп…</span>}
        {settingsReady && (
          <CompactFieldGrid
            className="elec-idop-settings__grid"
            columns={2}
            flow="rows"
            sizing="content"
            density="compact"
          >
            <CompactField
              label={(
                <span
                  className="elec-idop-settings__label"
                  data-field-help={helpText}
                >
                  I доп проекта — допустимый стартовый ток одной секции, А
                </span>
              )}
              labelWidth="300px"
              controlWidth="260px"
              error={validationError
                ? <span id={errorId} role="alert">{validationError}</span>
                : undefined}
            >
              <TltNumberField
                id={`${formId}-input`}
                aria-label="I доп проекта — допустимый стартовый ток одной секции, А"
                data-testid="elec-idop-input"
                disabled={controlsDisabled}
                status={validationError ? 'error' : ''}
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? errorId : helpId}
                min={0.001}
                step={0.1}
                value={draftMode === 'auto' ? null : draftIdop}
                onChange={handleDraftChange}
                placeholder={draftMode === 'auto' ? 'По каталогу' : undefined}
              />
            </CompactField>
            <TltButton
              variant="primary"
              size="compact"
              loading={saving}
              disabled={!canMutate || !canSave}
              title={canMutate
                ? undefined
                : 'Только владелец проекта или администратор может изменить I доп'}
              onClick={save}
              data-testid="elec-idop-save"
            >
              Сохранить I доп
            </TltButton>
          </CompactFieldGrid>
        )}
        {settingsReady && (
          <span id={helpId} className="elec-idop-settings__sr-only">
            {helpText}
          </span>
        )}
      </div>
    </div>
  );
}
