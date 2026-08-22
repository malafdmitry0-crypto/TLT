import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ElectricalSummary, { type ElectricalSystemSummaries } from '@/components/electrical/ElectricalSummary';

const systems: ElectricalSystemSummaries = {
  self_regulating: {
    objectCount: 2,
    cableLengthM: 115.4,
    sectionCount: 3,
    powerW: 2400,
    startCurrentA: 15.2,
    workingCurrentA: 10.4,
  },
  resistive: {
    objectCount: 1,
    cableLengthM: 24,
    sectionCount: 1,
    powerW: 800,
    startCurrentA: 4.2,
    workingCurrentA: 3.6,
  },
  total: {
    objectCount: 3,
    cableLengthM: 139.4,
    sectionCount: 4,
    powerW: 3200,
    startCurrentA: 19.4,
    workingCurrentA: 14,
  },
};

describe('ElectricalSummary', () => {
  it('shows MVP summary cards Samreg + Total only (E1 / FE-28)', () => {
    render(<ElectricalSummary systems={systems} />);

    expect(screen.getByTestId('elec-summary-table')).toBeInTheDocument();
    expect(screen.getByText('Самрег')).toBeInTheDocument();
    expect(screen.getByText('Итого')).toBeInTheDocument();
    expect(screen.queryByText('Резистив')).not.toBeInTheDocument();

    // Objects
    expect(screen.getByTestId('elec-summary-self_regulating-objects')).toHaveTextContent('2');
    expect(screen.getByTestId('elec-summary-total-objects')).toHaveTextContent('3');
    expect(screen.queryByTestId('elec-summary-resistive-objects')).not.toBeInTheDocument();

    // Length
    expect(screen.getByTestId('elec-summary-self_regulating-length')).toHaveTextContent('115');
    expect(screen.getByTestId('elec-summary-total-length')).toHaveTextContent('139');

    // Sections
    expect(screen.getByTestId('elec-summary-self_regulating-sections')).toHaveTextContent('3');
    expect(screen.getByTestId('elec-summary-total-sections')).toHaveTextContent('4');

    // Power kW
    expect(screen.getByTestId('elec-summary-self_regulating-power')).toHaveTextContent('2,4');
    expect(screen.getByTestId('elec-summary-total-power')).toHaveTextContent('3,2');

    // Currents
    expect(screen.getByTestId('elec-summary-self_regulating-start-current')).toHaveTextContent('15,2');
    expect(screen.getByTestId('elec-summary-self_regulating-working-current')).toHaveTextContent('10,4');
    expect(screen.getByTestId('elec-summary-total-start-current')).toHaveTextContent('19,4');
  });
});
