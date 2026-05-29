import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import HeatCalcEmptyProjectState from '@/pages/heatcalc/HeatCalcEmptyProjectState';

describe('HeatCalcEmptyProjectState', () => {
  it('renders the HeatCalc empty project copy', () => {
    render(
      <MemoryRouter>
        <HeatCalcEmptyProjectState />
      </MemoryRouter>,
    );

    expect(screen.getByText('Расчёт теплопотерь')).toBeInTheDocument();
    expect(screen.getByText(
      'Шаг 1 из 4. Добавьте объекты (трубопроводы, резервуары) вручную или импортом из Excel / CSV — система автоматически рассчитает тепловые потери.',
    )).toBeInTheDocument();
  });
});
