import type { ReactNode, RefCallback } from 'react';
import type { HeatCalcObjectType } from '@/types/project';
import HeatCalcObjectFieldsPanel from './HeatCalcObjectFieldsPanel';
import WizardZoneBoundary from './isolation/WizardZoneBoundary';

export interface ObjectWizardWidePanelProps {
  formGridRef: RefCallback<HTMLDivElement>;
  objectType: HeatCalcObjectType;
  wideLeft: ReactNode;
  wideRight: ReactNode;
  compactLeft: ReactNode;
  compactRight: ReactNode;
  geometry: ReactNode;
  climate: ReactNode;
  insulationSettings: ReactNode;
  insulationTable: ReactNode;
}

export default function ObjectWizardWidePanel({
  formGridRef,
  objectType,
  wideLeft,
  wideRight,
  compactLeft,
  compactRight,
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
            objectType={objectType}
            wideLeft={wideLeft}
            wideRight={wideRight}
            compactLeft={compactLeft}
            compactRight={compactRight}
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
