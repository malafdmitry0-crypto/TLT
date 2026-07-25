/**
 * Characterization: WizardZoneBoundary DOM tags, data attrs, error isolation, DOM guard.
 * RISK-TYPE-WIZARD-REF-01 — div/section typed without ref as never.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WizardZoneBoundary from '@/components/wizard/isolation/WizardZoneBoundary';
import { silenceExpectedErrorNoise } from '@/__tests__/utils/silenceExpectedErrorNoise';

describe('WizardZoneBoundary', () => {
  it('defaults to a div root with island data attributes', () => {
    const { container } = render(
      <WizardZoneBoundary
        islandId="cable-algorithm"
        className="heatcalc-dual-forms__cable"
        data-testid="wizard-zone-cable-algorithm"
      >
        <span>cable body</span>
      </WizardZoneBoundary>,
    );

    const root = container.querySelector(
      '[data-testid="wizard-zone-cable-algorithm"]',
    );
    expect(root).not.toBeNull();
    expect(root?.tagName).toBe('DIV');
    expect(root).toHaveAttribute('data-wizard-island', 'cable-algorithm');
    expect(root).toHaveAttribute('data-wizard-zone', 'cable-algorithm');
    expect(root).toHaveClass('heatcalc-dual-forms__cable');
    // cable-algorithm is not a protected island
    expect(root).not.toHaveAttribute('data-protected-zone');
    expect(screen.getByText('cable body')).toBeInTheDocument();
  });

  it('renders section when as="section" and preserves zone/form attrs', () => {
    const { container } = render(
      <WizardZoneBoundary
        islandId="insulation-layers-table"
        as="section"
        className="form-col-srs form-col-srs--insulation"
        data-form-column="insulation"
        data-testid="wizard-zone-insulation-layers"
        aria-label="Таблица слоёв изоляции"
      >
        <span>layers body</span>
      </WizardZoneBoundary>,
    );

    const root = container.querySelector(
      '[data-testid="wizard-zone-insulation-layers"]',
    );
    expect(root).not.toBeNull();
    expect(root?.tagName).toBe('SECTION');
    expect(root).toHaveAttribute('data-wizard-island', 'insulation-layers-table');
    expect(root).toHaveAttribute('data-wizard-zone', 'insulation-layers');
    expect(root).toHaveAttribute('data-protected-zone', 'insulation-layers-table');
    expect(root).toHaveAttribute('data-form-column', 'insulation');
    expect(root).toHaveAttribute('aria-label', 'Таблица слоёв изоляции');
    expect(screen.getByText('layers body')).toBeInTheDocument();
  });

  it('isolates React child crashes to the zone error panel', () => {
    const noise = silenceExpectedErrorNoise();
    try {
      function Boom(): never {
        throw new Error('island boom');
      }

      render(
        <WizardZoneBoundary islandId="heat-object-fields" data-testid="zone-fields">
          <Boom />
        </WizardZoneBoundary>,
      );

      const panel = screen.getByTestId('wizard-zone-error-heat-object-fields');
      expect(panel).toHaveAttribute('data-wizard-isolation-error', 'REACT_CRASH');
      expect(panel).toHaveTextContent('island boom');
      expect(panel).toHaveTextContent('FIX:');
      // zone root should not wipe the shell — error panel is the boundary content
      expect(screen.queryByTestId('zone-fields')).not.toBeInTheDocument();
    } finally {
      noise.restore();
    }
  });

  it('surfaces DOM foreign-island guard errors in DEV', async () => {
    const noise = silenceExpectedErrorNoise();
    try {
      render(
        <WizardZoneBoundary
          islandId="heat-object-fields"
          data-testid="zone-fields-guard"
        >
          {/* foreign island rootClass inside this zone — triggers DOM_FOREIGN_ISLAND */}
          <div className="insulation-layers-table">leaked</div>
        </WizardZoneBoundary>,
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('wizard-zone-error-heat-object-fields'),
        ).toBeInTheDocument();
      });

      const panel = screen.getByTestId('wizard-zone-error-heat-object-fields');
      expect(panel).toHaveAttribute('data-wizard-isolation-error', 'DOM_FOREIGN_ISLAND');
      expect(panel).toHaveTextContent('DOM isolation broken');
      expect(panel).toHaveTextContent('FIX:');
    } finally {
      noise.restore();
    }
  });
});
