/**
 * Project I доп: catalog-derived automatic mode or a numeric manual override.
 */
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
            columns={3}
            flow="rows"
            sizing="content"
            density="compact"
          >
            <CompactField
              label="Режим I доп проекта"
              labelWidth="110px"
              controlWidth="260px"
            >
              <div
                className="elec-idop-settings__mode-buttons"
                role="group"
                aria-label="Режим I доп проекта"
              >
                <TltButton
                  size="compact"
                  variant={draftMode === 'auto' ? 'primary' : 'secondary'}
                  aria-pressed={draftMode === 'auto'}
                  aria-controls={`${formId}-mode-content`}
                  disabled={controlsDisabled}
                  onClick={() => onModeChange('auto')}
                >
                  Автоматически по каталогу
                </TltButton>
                <TltButton
                  size="compact"
                  variant={draftMode === 'manual' ? 'primary' : 'secondary'}
                  aria-pressed={draftMode === 'manual'}
                  aria-controls={`${formId}-mode-content`}
                  disabled={controlsDisabled}
                  onClick={() => onModeChange('manual')}
                >
                  Вручную
                </TltButton>
              </div>
            </CompactField>
            {draftMode === 'manual' && (
              <CompactField
                label="I доп проекта — допустимый стартовый ток одной секции, А"
                labelWidth="280px"
                controlWidth="118px"
                required
                error={validationError
                  ? <span id={`${formId}-error`} role="alert">{validationError}</span>
                  : undefined}
              >
                <TltNumberField
                  id={`${formId}-input`}
                  aria-label="I доп проекта — допустимый стартовый ток одной секции, А"
                  data-testid="elec-idop-input"
                  disabled={controlsDisabled}
                  required
                  status={validationError ? 'error' : ''}
                  aria-invalid={Boolean(validationError)}
                  aria-describedby={validationError ? `${formId}-error` : undefined}
                  min={0.001}
                  step={0.1}
                  value={draftIdop}
                  onChange={onDraftChange}
                  placeholder="например 13"
                />
              </CompactField>
            )}
            {canMutate && (
              <TltButton
                variant="primary"
                size="compact"
                loading={saving}
                disabled={!canSave}
                onClick={save}
                data-testid="elec-idop-save"
              >
                Сохранить I доп
              </TltButton>
            )}
          </CompactFieldGrid>
        )}
        {settingsReady && (
          <div id={`${formId}-mode-content`} aria-live="polite">
            {draftMode === 'auto' && (
              <p className="elec-idop-settings__auto-copy">
                Применяемый I доп рассчитывается отдельно для каждого объекта по выбранной
                строке каталога: I доп = Lмакс × Iст.уд.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
