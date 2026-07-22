export type ObjectWizardLayoutVariant = 'wide' | 'side';

/** @deprecated Use HeatCalcObjectFieldsPanel slots via ObjectWizardWidePanel/SidePanel props. */
export interface ObjectWizardPanelRenderers {
  renderGeometrySection: () => unknown;
  renderInsulationSection: () => unknown;
  renderTemperatureSection: () => unknown;
}
