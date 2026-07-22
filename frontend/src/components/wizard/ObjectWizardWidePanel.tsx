import type { ReactNode, RefCallback } from 'react';
import HeatCalcObjectFieldsPanel from './HeatCalcObjectFieldsPanel';
import WizardZoneBoundary from './isolation/WizardZoneBoundary';

export interface ObjectWizardWidePanelProps {
  geometryTitle: string;
  formGridRef: RefCallback<HTMLDivElement>;
  geometry: ReactNode;
  climate: ReactNode;
  insulationSettings: ReactNode;
  insulationTable: ReactNode;
}

/**
 * Wide heat card shell (layout only — no form-item styles).
 *
 * Isolated React zones (see isolation/ + WIZARD-ISLANDS.md):
 *   1) WizardZoneBoundary heat-object-fields  → HeatCalcObjectFieldsPanel
 *   2) WizardZoneBoundary insulation-layers  → InsulationLayersTable
 *
 * Shell must not import island internals beyond the public panel components.
 * CSS for controls lives in co-located island CSS files only.
 */
export default function ObjectWizardWidePanel({
  formGridRef,
  geometry,
  climate,
  insulationSettings,
  insulationTable,
}: ObjectWizardWidePanelProps) {
  return (
    <div
      className="object-wizard-wide-panel"
      data-panel="wide"
      data-testid="heat-pdf-three-column-form"
      data-wizard-shell="heat-wide"
    >
      <h4 className="inline-form-section-banner">
        <span>Расчёт теплопотерь</span>
      </h4>
      <div
        className="form-grid-srs form-grid-srs--merged form-grid-srs--pdf-three form-grid-srs--heat-structured"
        ref={formGridRef}
        data-layout="wide-engineering-workspace"
      >
        <WizardZoneBoundary
          islandId="heat-object-fields"
          className="heat-wizard-zone heat-wizard-zone--fields"
          data-testid="wizard-zone-heat-object-fields"
        >
          <HeatCalcObjectFieldsPanel
            layout="wide"
            geometry={geometry}
            climate={climate}
            insulationSettings={insulationSettings}
          />
        </WizardZoneBoundary>

        <WizardZoneBoundary
          islandId="insulation-layers-table"
          as="section"
          className="form-col-srs form-col-srs--insulation pdf-form-column heat-wizard-zone heat-wizard-zone--layers"
          data-form-column="insulation"
          data-testid="wizard-zone-insulation-layers"
          aria-label="Таблица слоёв изоляции"
        >
          {insulationTable}
        </WizardZoneBoundary>
      </div>
    </div>
  );
}
