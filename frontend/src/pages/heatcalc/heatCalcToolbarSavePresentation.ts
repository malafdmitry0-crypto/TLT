/**
 * @module heatcalc/toolbar-save-presentation
 * @owner heat
 * @depends none
 * @does-not electrical, api
 */

export type HeatCalcToolbarSavePresentationInput = {
  saveTargetCount: number;
  hasWizard: boolean;
  selectedDirtyTarget: boolean;
  inlineDraftSaving: boolean;
  submittingObject: boolean;
};

export type HeatCalcToolbarSavePresentation = {
  toolbarSaveDisabled: boolean;
  toolbarSaveLoading: boolean;
  toolbarSaveTooltip: string;
};

/** Labels/disabled/loading for the shared Heat actions toolbar save control. */
export function buildHeatCalcToolbarSavePresentation({
  saveTargetCount,
  hasWizard,
  selectedDirtyTarget,
  inlineDraftSaving,
  submittingObject,
}: HeatCalcToolbarSavePresentationInput): HeatCalcToolbarSavePresentation {
  const toolbarSaveDisabled = saveTargetCount === 0 && !hasWizard;
  const toolbarSaveLoading = inlineDraftSaving || submittingObject;
  const toolbarSaveTooltip = saveTargetCount > 0
    ? selectedDirtyTarget
      ? `Сохранить выбранные строки (${saveTargetCount})`
      : `Сохранить несохранённые строки (${saveTargetCount})`
    : hasWizard
      ? 'Сохранить объект'
      : 'Нет изменений для сохранения';

  return {
    toolbarSaveDisabled,
    toolbarSaveLoading,
    toolbarSaveTooltip,
  };
}
