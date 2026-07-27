import type { ReactNode } from 'react';
import type { HeatCalcObjectType } from '@/types/project';
import HeatCalcObjectFieldsPanel from './HeatCalcObjectFieldsPanel';

export interface ObjectWizardSidePanelProps {
  objectType: HeatCalcObjectType;
  geometry: ReactNode;
  climate: ReactNode;
  insulationSettings: ReactNode;
  insulationTable: ReactNode;
}

/**
 * Side heat card: same protected boundaries as wide.
 */
export default function ObjectWizardSidePanel({
  objectType,
  geometry,
  climate,
  insulationSettings,
  insulationTable,
}: ObjectWizardSidePanelProps) {
  return (
    <div className="object-wizard-side-panel" data-panel="side">
      <h4 className="side-form-section-banner"><span>Расчёт теплопотерь</span></h4>
      <div className="side-form-grid-srs side-form-grid-srs--compact" data-layout="side">
        <div className="side-compact-form" data-testid="heat-side-compact-form">
          {/* ⛔ PROTECTED: HeatCalcObjectFieldsPanel */}
          <HeatCalcObjectFieldsPanel
            layout="side"
            objectType={objectType}
            geometry={geometry}
            climate={climate}
            insulationSettings={insulationSettings}
          />
          <div className="side-compact-insulation">
            {/* ⛔ PROTECTED: InsulationLayersTable */}
            {insulationTable}
          </div>
        </div>
      </div>
    </div>
  );
}
