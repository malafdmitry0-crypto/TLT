import { describe, expect, it } from 'vitest';

import { buildHeatCalcToolbarSavePresentation } from '@/pages/heatcalc/heatCalcToolbarSavePresentation';

describe('buildHeatCalcToolbarSavePresentation', () => {
  it('disabled when no drafts and no wizard', () => {
    expect(buildHeatCalcToolbarSavePresentation({
      saveTargetCount: 0,
      hasWizard: false,
      selectedDirtyTarget: false,
      inlineDraftSaving: false,
      submittingObject: false,
    })).toEqual({
      toolbarSaveDisabled: true,
      toolbarSaveLoading: false,
      toolbarSaveTooltip: 'Нет изменений для сохранения',
    });
  });

  it('enables save for wizard only', () => {
    const result = buildHeatCalcToolbarSavePresentation({
      saveTargetCount: 0,
      hasWizard: true,
      selectedDirtyTarget: false,
      inlineDraftSaving: false,
      submittingObject: true,
    });
    expect(result.toolbarSaveDisabled).toBe(false);
    expect(result.toolbarSaveLoading).toBe(true);
    expect(result.toolbarSaveTooltip).toBe('Сохранить объект');
  });

  it('prefers selected dirty rows tooltip', () => {
    expect(buildHeatCalcToolbarSavePresentation({
      saveTargetCount: 3,
      hasWizard: true,
      selectedDirtyTarget: true,
      inlineDraftSaving: true,
      submittingObject: false,
    })).toMatchObject({
      toolbarSaveDisabled: false,
      toolbarSaveLoading: true,
      toolbarSaveTooltip: 'Сохранить выбранные строки (3)',
    });
  });

  it('uses unsaved rows tooltip without selection', () => {
    expect(buildHeatCalcToolbarSavePresentation({
      saveTargetCount: 2,
      hasWizard: false,
      selectedDirtyTarget: false,
      inlineDraftSaving: false,
      submittingObject: false,
    }).toolbarSaveTooltip).toBe('Сохранить несохранённые строки (2)');
  });
});
