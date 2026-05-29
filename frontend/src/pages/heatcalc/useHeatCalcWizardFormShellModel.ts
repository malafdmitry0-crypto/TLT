import {
  useCallback,
  useMemo,
} from 'react';

import type { ProjectObject } from '@/types/project';
import {
  buildDraftDisplayRecord,
  getDraftRowValidationErrors,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';
import type { WizardState } from '@/pages/heatcalc/useHeatCalcObjectEditor';

interface UseHeatCalcWizardFormShellModelOptions {
  allProjectObjects: ProjectObject[];
  draftRowsById: DraftRowsById;
  visibleTableObjects: ProjectObject[];
  wizardState: WizardState | null;
  applyWizardDraftValuesChange: (
    record: ProjectObject | null,
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
}

export function resolveWizardBaseObject({
  allProjectObjects,
  visibleTableObjects,
  wizardState,
}: Pick<
  UseHeatCalcWizardFormShellModelOptions,
  'allProjectObjects' | 'visibleTableObjects' | 'wizardState'
>): ProjectObject | null {
  const editingObject = wizardState?.editingObject;
  if (!editingObject) return null;
  const tableObject = visibleTableObjects.find((object) => object.id === editingObject.id)
    ?? allProjectObjects.find((object) => object.id === editingObject.id);
  if (!tableObject || editingObject.version > tableObject.version) return editingObject;
  return tableObject;
}

export function useHeatCalcWizardFormShellModel({
  allProjectObjects,
  draftRowsById,
  visibleTableObjects,
  wizardState,
  applyWizardDraftValuesChange,
}: UseHeatCalcWizardFormShellModelOptions) {
  const wizardBaseObject = useMemo(
    () => resolveWizardBaseObject({ allProjectObjects, visibleTableObjects, wizardState }),
    [allProjectObjects, visibleTableObjects, wizardState],
  );

  const wizardFormObject = useMemo(() => {
    if (!wizardBaseObject) return null;
    return buildDraftDisplayRecord(draftRowsById[wizardBaseObject.id], wizardBaseObject);
  }, [draftRowsById, wizardBaseObject]);

  const wizardDraftFieldErrors = useMemo(() => {
    if (!wizardBaseObject) return undefined;
    const draftRow = draftRowsById[wizardBaseObject.id];
    return draftRow ? getDraftRowValidationErrors(draftRow) : undefined;
  }, [draftRowsById, wizardBaseObject]);

  const handleWizardDraftValuesChange = useCallback((
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => {
    applyWizardDraftValuesChange(wizardBaseObject, changedValues, allValues);
  }, [applyWizardDraftValuesChange, wizardBaseObject]);

  return {
    wizardBaseObject,
    wizardFormObject,
    wizardDraftFieldErrors,
    handleWizardDraftValuesChange,
  };
}
