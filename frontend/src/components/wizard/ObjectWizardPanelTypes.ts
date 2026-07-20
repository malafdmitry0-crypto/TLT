import type {
  ReactNode,
  RefCallback,
} from 'react';

export type ObjectWizardLayoutVariant = 'wide' | 'side';

export interface ObjectWizardPanelRenderers {
  renderGeometrySection: () => ReactNode;
  renderInsulationSection: () => ReactNode;
  renderTemperatureSection: () => ReactNode;
}

export interface ObjectWizardWidePanelProps extends ObjectWizardPanelRenderers {
  geometryTitle: string;
  renderFittingsSection: () => ReactNode;
  formGridRef: RefCallback<HTMLDivElement>;
}

export type ObjectWizardSidePanelProps = ObjectWizardPanelRenderers;
