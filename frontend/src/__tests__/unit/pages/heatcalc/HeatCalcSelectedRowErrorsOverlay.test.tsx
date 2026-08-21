import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HeatCalcSelectedRowErrorsOverlay from '@/pages/heatcalc/HeatCalcSelectedRowErrorsOverlay';

describe('HeatCalcSelectedRowErrorsOverlay', () => {
  it('renders nothing for empty messages', () => {
    const { container } = render(<HeatCalcSelectedRowErrorsOverlay messages={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders up to four messages', () => {
    render(<HeatCalcSelectedRowErrorsOverlay messages={['Ошибка 1', 'Ошибка 2', 'Ошибка 3', 'Ошибка 4']} />);

    const overlay = screen.getByLabelText('Ошибки выбранной строки');
    expect(overlay).toHaveTextContent('Ошибка 1; Ошибка 2; Ошибка 3; Ошибка 4');
    expect(overlay).not.toHaveTextContent('ещё');
  });

  it('appends hidden message count after the first four messages', () => {
    render(<HeatCalcSelectedRowErrorsOverlay messages={[
      'Ошибка 1',
      'Ошибка 2',
      'Ошибка 3',
      'Ошибка 4',
      'Ошибка 5',
      'Ошибка 6',
    ]} />);

    const overlay = screen.getByLabelText('Ошибки выбранной строки');
    expect(overlay).toHaveTextContent('Ошибка 1; Ошибка 2; Ошибка 3; Ошибка 4; ещё 2');
    expect(overlay).not.toHaveTextContent('Ошибка 5');
    expect(overlay).not.toHaveTextContent('Ошибка 6');
    expect(screen.getByTitle('Ошибка 1; Ошибка 2; Ошибка 3; Ошибка 4; ещё 2')).toBeInTheDocument();
  });

  it('preserves test id, status role, and aria label', () => {
    render(<HeatCalcSelectedRowErrorsOverlay messages={['Ошибка']} />);

    const overlay = screen.getByTestId('heatcalc-row-errors-overlay');
    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay).toHaveAttribute('aria-label', 'Ошибки выбранной строки');
    expect(screen.getByText('Ошибки выбранной строки')).toBeInTheDocument();
  });
});
