import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcRecalculationSettings from '@/pages/electrical/ElecCalcRecalculationSettings';

const cableSourceOptions = [
  { label: 'Встроенная', value: 'builtin' as const },
  { label: 'Внешняя', value: 'extended' as const },
  { label: 'Все', value: 'all' as const },
];

function setup(overrides: Partial<Parameters<typeof ElecCalcRecalculationSettings>[0]> = {}) {
  const props = {
    commercialFeaturesAvailable: true,
    isEmployee: true,
    calculationCableSource: 'builtin' as const,
    cableSourceOptions,
    selectionPolicy: 'technical_minimum' as const,
    commercialDataStatus: { label: 'Коммерческие данные есть', color: 'success' as const },
    technicalDataStatus: { label: 'Техданные полные', color: 'success' as const },
    onCalculationCableSourceChange: vi.fn(),
    onSelectionPolicyChange: vi.fn(),
    ...overrides,
  };
  return {
    props,
    user: userEvent.setup(),
    ...render(<ElecCalcRecalculationSettings {...props} />),
  };
}

describe('ElecCalcRecalculationSettings', () => {
  it('renders source controls and routes source changes for employees', async () => {
    const { props, user } = setup();

    expect(screen.getByLabelText('Настройки пересчёта')).toBeInTheDocument();
    expect(screen.getByText('База для пересчёта:')).toBeInTheDocument();
    expect(screen.getByText('Техданные полные')).toBeInTheDocument();

    await user.click(screen.getByText('Внешняя'));
    expect(props.onCalculationCableSourceChange).toHaveBeenCalledWith('extended');
  });

  it('hides source controls when commercial features are disabled', () => {
    setup({ commercialFeaturesAvailable: false });

    expect(screen.queryByText('База для пересчёта:')).not.toBeInTheDocument();
    expect(screen.getByText('Техданные полные')).toBeInTheDocument();
  });

  it('can render commercial status and selection policy control', () => {
    setup({ showCommercialCableBaseUi: true });

    expect(screen.getByText('Коммерческие данные есть')).toBeInTheDocument();
    expect(screen.getByText('Критерий:')).toBeInTheDocument();
    expect(screen.getByLabelText('Критерий подбора кабеля')).toBeInTheDocument();
    expect(screen.getByLabelText('Критерий подбора кабеля')).toHaveTextContent('Технический');
  });
});
