import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CompactField,
  CompactFieldGrid,
  TltNumberField,
  TltTextField,
} from '@/components/ui-kit';

describe('UI component library', () => {
  it('composes a label, control and hint through the public API', () => {
    render(
      <CompactField label="Температура" required hint="Рабочий диапазон">
        <TltNumberField aria-label="Температура" defaultValue={95} unit="°C" />
      </CompactField>,
    );

    expect(screen.getByText('Температура')).toBeInTheDocument();
    // HeatCalc contract: no asterisk (requiredMark=false), required = inset style
    expect(screen.queryByText('*')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Температура' })).toHaveValue('95');
    expect(screen.getByText('Рабочий диапазон')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Температура' }).parentElement?.parentElement)
      .toHaveClass('tlt-compact-field__control');
  });

  it('shows an error instead of a hint', () => {
    render(
      <CompactField label="Наименование" hint="До 120 символов" error="Обязательное поле">
        <TltTextField aria-label="Наименование" />
      </CompactField>,
    );

    expect(screen.getByText('Обязательное поле')).toBeInTheDocument();
    expect(screen.queryByText('До 120 символов')).not.toBeInTheDocument();
  });

  it('exposes layout, density and the optional Ant Form adapter declaratively', () => {
    const { container } = render(
      <CompactFieldGrid
        antFormAdapter
        columns={4}
        density="comfortable"
        flow="columns"
        maxRowsPerColumn={5}
        sizing="equal"
      >
        <div>Поле</div>
      </CompactFieldGrid>,
    );

    const grid = container.querySelector('.tlt-compact-field-grid');
    expect(grid).toHaveClass(
      'tlt-compact-field-grid--comfortable',
      'tlt-compact-field-grid--flow-columns',
      'tlt-compact-field-grid--sizing-equal',
      'tlt-compact-field-grid--ant-form',
    );
    expect(grid).toHaveAttribute('data-density', 'comfortable');
    expect(grid).toHaveStyle({
      '--tlt-field-grid-columns': '4',
      '--tlt-field-grid-max-rows': '5',
    });
  });

  it('keeps HeatCalc-like content sizing as the default grid contract', () => {
    const { container } = render(
      <CompactFieldGrid>
        <CompactField label="Наружный диаметр" controlWidth="var(--tlt-field-ctrl-num)">
          <TltNumberField aria-label="Наружный диаметр" unit="мм" />
        </CompactField>
      </CompactFieldGrid>,
    );

    expect(container.querySelector('.tlt-compact-field-grid'))
      .toHaveClass('tlt-compact-field-grid--sizing-content');
    expect(container.querySelector('.tlt-compact-field'))
      .toHaveStyle({ '--tlt-compact-control-width': 'var(--tlt-field-ctrl-num)' });
  });

  it('uses HeatCalc SC-03 tokens on Tlt controls inside CompactField', () => {
    const { container } = render(
      <CompactField label="Температура" required controlWidth="var(--tlt-field-ctrl-num)">
        <TltNumberField aria-label="Температура" unit="°C" defaultValue={-20} />
      </CompactField>,
    );

    const field = container.querySelector('.tlt-compact-field');
    const input = container.querySelector('.tlt-number-field__input');
    const unit = container.querySelector('.tlt-number-field__unit');
    expect(field).toHaveClass('tlt-compact-field--required');
    expect(input).toBeTruthy();
    expect(unit).toHaveTextContent('°C');
  });
});
