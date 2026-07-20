import type { ObjectWizardWidePanelProps } from './ObjectWizardPanelTypes';

/** SC-03: flat engineering workspace with four always-visible semantic regions. */
export default function ObjectWizardWidePanel({
  geometryTitle,
  formGridRef,
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
        data-layout="wide-engineering-workspace"
      >
        <section
          className="form-col-srs form-col-srs--primary pdf-form-column"
          data-form-column="geometry"
          aria-labelledby="form-col-geometry-title"
        >
          <h4 id="form-col-geometry-title" className="pdf-form-column-title" data-step="1">
            <span>{geometryTitle}</span>
          </h4>
          {renderGeometrySection()}
          {renderFittingsSection()}
        </section>

        <section
          className="form-col-srs form-col-srs--climate pdf-form-column"
          data-form-column="environment"
          aria-labelledby="form-col-environment-title"
        >
          <h4 id="form-col-environment-title" className="pdf-form-column-title" data-step="2">
            <span>Условия эксплуатации</span>
          </h4>
          {renderTemperatureSection()}
        </section>

        <section
          className="form-col-srs form-col-srs--insulation pdf-form-column"
          data-form-column="insulation"
          aria-labelledby="form-col-insulation-title"
        >
          <h4 id="form-col-insulation-title" className="pdf-form-column-title" data-step="4">
            <span>Теплоизоляция</span>
          </h4>
          {renderInsulationSection()}
        </section>
      </div>
    </div>
  );
}
