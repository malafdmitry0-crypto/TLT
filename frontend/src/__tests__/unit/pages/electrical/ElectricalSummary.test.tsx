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
  it('shows all cable systems in one compact table without legacy summary titles', () => {
    render(<ElectricalSummary systems={systems} />);

    expect(screen.getByText('Итоги по кабелю')).toBeInTheDocument();
    expect(screen.queryByText(/Саммари/i)).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(5);

    expect(screen.getByTestId('elec-summary-self_regulating')).toHaveTextContent('Самрег');
    expect(screen.getByTestId('elec-summary-resistive')).toHaveTextContent('Резистив');
    expect(screen.getByTestId('elec-summary-skin')).toHaveTextContent('Скин');
    expect(screen.getByTestId('elec-summary-total')).toHaveTextContent('Итого');
    expect(screen.getByTestId('elec-summary-skin')).toHaveTextContent('—');
  });
});
