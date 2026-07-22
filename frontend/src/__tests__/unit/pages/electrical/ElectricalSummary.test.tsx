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
  skin: {
    objectCount: 0,
    cableLengthM: 0,
    sectionCount: null,
    powerW: 0,
    startCurrentA: 0,
    workingCurrentA: 0,
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
  it('shows four summary cards (mockup layout)', () => {
    render(<ElectricalSummary systems={systems} />);

    expect(screen.getByTestId('elec-summary-table')).toBeInTheDocument();
    expect(screen.getByText('Саммари Самрег')).toBeInTheDocument();
    expect(screen.getByText('Саммари Резистив')).toBeInTheDocument();
    expect(screen.getByText('Саммари Скин')).toBeInTheDocument();
    expect(screen.getByText('Саммари Итого')).toBeInTheDocument();

    // Objects
    expect(screen.getByTestId('elec-summary-self_regulating-objects')).toHaveTextContent('2');
    expect(screen.getByTestId('elec-summary-resistive-objects')).toHaveTextContent('1');
    expect(screen.getByTestId('elec-summary-skin-objects')).toHaveTextContent('0');
    expect(screen.getByTestId('elec-summary-total-objects')).toHaveTextContent('3');

    // Length
    expect(screen.getByTestId('elec-summary-self_regulating-length')).toHaveTextContent('115');
    expect(screen.getByTestId('elec-summary-resistive-length')).toHaveTextContent('24');
    expect(screen.getByTestId('elec-summary-total-length')).toHaveTextContent('139');

    // Sections
    expect(screen.getByTestId('elec-summary-self_regulating-sections')).toHaveTextContent('3');
    expect(screen.getByTestId('elec-summary-skin-sections')).toHaveTextContent('—');
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
