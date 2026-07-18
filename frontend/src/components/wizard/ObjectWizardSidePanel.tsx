import type { ObjectWizardSidePanelProps } from './ObjectWizardPanelTypes';

export default function ObjectWizardSidePanel({
  geometryTitle,
  renderGeometrySection,
  renderInsulationSection,
  renderTemperatureSection,
}: ObjectWizardSidePanelProps) {
  return (
    <div className="object-wizard-side-panel" data-panel="side">
      <h4 className="side-form-section-banner"><span>Расчёт теплопотерь</span></h4>
      <div className="side-form-grid-srs" data-layout="side">
        <section className="side-form-section side-form-section--primary">
          <h4 data-step="1"><span>{geometryTitle}</span></h4>
          {renderGeometrySection()}
        </section>
        <section className="side-form-section side-form-section--insulation">
          <h4 data-step="2"><span>Теплоизоляция</span></h4>
          {renderInsulationSection()}
        </section>
        <section className="side-form-section side-form-section--temperature">
          <h4 data-step="3"><span>Климат и температуры</span></h4>
          {renderTemperatureSection()}
        </section>
      </div>
    </div>
  );
}
