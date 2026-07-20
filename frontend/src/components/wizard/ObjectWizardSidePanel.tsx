import type { ObjectWizardSidePanelProps } from './ObjectWizardPanelTypes';

export default function ObjectWizardSidePanel({
  renderGeometrySection,
  renderInsulationSection,
  renderTemperatureSection,
}: ObjectWizardSidePanelProps) {
  return (
    <div className="object-wizard-side-panel" data-panel="side">
      <h4 className="side-form-section-banner"><span>Расчёт теплопотерь</span></h4>
      <div className="side-form-grid-srs side-form-grid-srs--compact" data-layout="side">
        <div className="side-compact-form" data-testid="heat-side-compact-form">
          {renderGeometrySection()}
          <div className="side-compact-insulation">
            {renderInsulationSection()}
          </div>
          {renderTemperatureSection()}
        </div>
      </div>
    </div>
  );
}
