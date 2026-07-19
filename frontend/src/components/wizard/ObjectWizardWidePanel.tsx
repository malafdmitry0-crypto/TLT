import type { ObjectWizardWidePanelProps } from './ObjectWizardPanelTypes';

/**
 * PDF UI-PDF-01 (стр. 21): three-column form —
 * heat loss · cable selection · specification / climate.
 */
export default function ObjectWizardWidePanel({
  formGridRef,
  sectionStyle,
  renderGeometrySection,
  renderFittingsSection,
  renderInsulationSection,
  renderTemperatureSection,
}: ObjectWizardWidePanelProps) {
  return (
    <div
      className="object-wizard-wide-panel"
      data-panel="wide"
      data-testid="heat-pdf-three-column-form"
    >
      <div
        className="form-grid-srs form-grid-srs--merged form-grid-srs--pdf-three"
        ref={formGridRef}
        data-layout="wide-pdf-3"
      >
        <section
          className="form-col-srs form-col-srs--heat pdf-form-column"
          style={sectionStyle(0)}
          data-pdf-column="heat"
          aria-labelledby="pdf-col-heat-title"
        >
          <h4 id="pdf-col-heat-title" className="pdf-form-column-title" data-step="1">
            <span>Исходные данные для расчёта теплопотерь</span>
          </h4>
          {renderGeometrySection()}
          {renderInsulationSection()}
        </section>

        <section
          className="form-col-srs form-col-srs--cable pdf-form-column"
          style={sectionStyle(1)}
          data-pdf-column="cable"
          aria-labelledby="pdf-col-cable-title"
        >
          <h4 id="pdf-col-cable-title" className="pdf-form-column-title" data-step="2">
            <span>Исходные данные для подбора кабеля</span>
          </h4>
          {renderFittingsSection()}
        </section>

        <section
          className="form-col-srs form-col-srs--spec pdf-form-column"
          style={sectionStyle(2)}
          data-pdf-column="spec"
          aria-labelledby="pdf-col-spec-title"
        >
          <h4 id="pdf-col-spec-title" className="pdf-form-column-title" data-step="3">
            <span>Исходные данные для спецификации</span>
          </h4>
          {renderTemperatureSection()}
        </section>
      </div>
    </div>
  );
}
