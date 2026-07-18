import type { ObjectWizardWidePanelProps } from './ObjectWizardPanelTypes';

export default function ObjectWizardWidePanel({
  formGridRef,
  sectionStyle,
  renderGeometrySection,
  renderFittingsSection,
  renderInsulationSection,
  renderTemperatureSection,
}: ObjectWizardWidePanelProps) {
  return (
    <div className="object-wizard-wide-panel" data-panel="wide">
      <div className="form-grid-srs form-grid-srs--merged" ref={formGridRef} data-layout="wide">
        <div
          className="form-col-srs form-col-srs--primary"
          style={sectionStyle(0)}
        >
          {renderGeometrySection()}
        </div>

        <div
          className="form-col-srs form-col-srs--fittings"
          style={sectionStyle(1)}
        >
          {renderFittingsSection()}
        </div>

        <div
          className="form-col-srs form-col-srs--climate"
          style={sectionStyle(2)}
        >
          {renderTemperatureSection()}
        </div>

        <div
          className="form-col-srs form-col-srs--insulation"
          style={sectionStyle(3)}
        >
          {renderInsulationSection()}
        </div>
      </div>
    </div>
  );
}
