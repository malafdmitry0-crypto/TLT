import {
  lazy,
  Suspense,
} from 'react';

import type { ProjectObject } from '@/types/project';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type {
  HeatCalcFormPlacement,
  HeatCalcFormSectionWeights,
} from '@/utils/heatCalcTableViewSettings';
import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';
import type { WizardState } from '@/pages/heatcalc/useHeatCalcObjectEditor';

export const loadHeatCalcObjectWizard = () => import('@/components/wizard/ObjectWizard');
const ObjectWizard = lazy(loadHeatCalcObjectWizard);

export function preloadHeatCalcObjectWizard() {
  void loadHeatCalcObjectWizard();
}

interface HeatCalcWizardFormPanelProps {
  formBlockVisible: boolean;
  formPlacement: HeatCalcFormPlacement;
  wizardState: WizardState | null;
  newWizardRevision: number;
  closeWizard: () => void;
  handleWizardSubmit: (params: Record<string, unknown>) => void;
  submittingObject: boolean;
  excelModeEnabled: boolean;
  wizardBaseObject: ProjectObject | null;
  wizardFormObject: ProjectObject | null;
  draftRowsById: DraftRowsById;
  wizardDraftFieldErrors?: Record<string, string>;
  fieldInputSettings: HeatCalcFieldInputSettings;
  formSectionWeights: HeatCalcFormSectionWeights;
  onFormSectionWeightsChange: (weights: HeatCalcFormSectionWeights) => void;
  onFormSectionWeightsCommit: (weights: HeatCalcFormSectionWeights) => void;
  onDraftValuesChange: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
}

export default function HeatCalcWizardFormPanel({
  formBlockVisible,
  formPlacement,
  wizardState,
  newWizardRevision,
  closeWizard,
  handleWizardSubmit,
  submittingObject,
  excelModeEnabled,
  wizardBaseObject,
  wizardFormObject,
  draftRowsById,
  wizardDraftFieldErrors,
  fieldInputSettings,
  formSectionWeights,
  onFormSectionWeightsChange,
  onFormSectionWeightsCommit,
  onDraftValuesChange,
}: HeatCalcWizardFormPanelProps) {
  return (
    <div
      className={`inline-form-shell heatcalc-form-pane heatcalc-form-pane--${formPlacement}`}
      aria-label="Блок заполнения параметров"
      hidden={!formBlockVisible}
    >
      <div className="inline-form-srs">
        {wizardState ? (
          <Suspense fallback={<div className="inline-object-form-placeholder" />}>
            <ObjectWizard
              key={wizardState.editingObject?.id ?? `${wizardState.type}-new-${newWizardRevision}`}
              objectType={wizardState.type}
              onClose={closeWizard}
              onSubmit={handleWizardSubmit}
              submitting={submittingObject}
              initialParams={(excelModeEnabled ? wizardFormObject : wizardBaseObject)?.params}
              initialFormValues={excelModeEnabled && wizardBaseObject
                ? draftRowsById[wizardBaseObject.id]?.draftFormValues
                : undefined}
              validationErrors={wizardFormObject?.validation_errors}
              fieldErrors={wizardDraftFieldErrors}
              fieldInputSettings={fieldInputSettings}
              formSectionWeights={formSectionWeights}
              sectionResizeEnabled={formPlacement === 'top' || formPlacement === 'bottom'}
              onFormSectionWeightsChange={onFormSectionWeightsChange}
              onFormSectionWeightsCommit={onFormSectionWeightsCommit}
              onDraftValuesChange={wizardBaseObject ? onDraftValuesChange : undefined}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
