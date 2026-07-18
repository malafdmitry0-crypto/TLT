import type {
  CSSProperties,
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
  renderFittingsSection: () => ReactNode;
  formGridRef: RefCallback<HTMLDivElement>;
  sectionStyle: (sectionIndex: number) => CSSProperties;
}

export interface ObjectWizardSidePanelProps extends ObjectWizardPanelRenderers {
  geometryTitle: string;
}
