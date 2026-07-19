import type { ObjectWizardWidePanelProps } from './ObjectWizardPanelTypes';

/**
 * PDF UI-PDF-01 (стр. 21): three-column layout —
 * A heat loss · B cable selection · C specification-oriented inputs.
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
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <div
          className="form-col-srs form-col-srs--heat"
          style={sectionStyle(0)}
          data-pdf-column="heat"
        >
          <h4 data-step="1" style={{ margin: '0 0 8px', fontSize: 13 }}>
            <span>Исходные данные для расчёта теплопотерь</span>
          </h4>
          {renderGeometrySection()}
          {renderInsulationSection()}
        </div>

        <div
          className="form-col-srs form-col-srs--cable"
          style={sectionStyle(1)}
          data-pdf-column="cable"
        >
          <h4 data-step="2" style={{ margin: '0 0 8px', fontSize: 13 }}>
            <span>Исходные данные для подбора кабеля</span>
          </h4>
          {renderFittingsSection()}
        </div>

        <div
          className="form-col-srs form-col-srs--spec"
          style={sectionStyle(2)}
          data-pdf-column="spec"
        >
          <h4 data-step="3" style={{ margin: '0 0 8px', fontSize: 13 }}>
            <span>Исходные данные для спецификации / климат</span>
          </h4>
          {renderTemperatureSection()}
        </div>
      </div>
    </div>
  );
}
