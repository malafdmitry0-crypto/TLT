import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcCableMarkModal from '@/pages/electrical/ElecCalcCableMarkModal';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import type { ProjectObject } from '@/types/project';

const ER_1_ID = '11111111-1111-4111-8111-111111111111';
const ER_2_ID = '22222222-2222-4222-8222-222222222222';
const ER_5_ID = '55555555-5555-4555-8555-555555555555';

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {
      name: 'Труба-1',
      outer_diameter: 0.108,
      pipe_length: 50,
      insulation_material: 'Минвата',
      insulation_thickness: 0.05,
      ambient_temperature: -20,
      process_temperature: 60,
    },
    results: {
      heat_loss_per_meter: 12.5,
      total_heat_loss: 625,
    },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function cableRow(): CableStatusRow {
  return {
    brand: 'TLT',
    model: 'ТЛТ-25',
    cable_type: 'self_regulating',
    power_per_meter: 25,
    max_temperature: 65,
    min_temperature: -60,
    source: 'builtin',
  };
}

const markOptions: CableMarkSelectOption[] = [
  {
    value: AUTO_CABLE_MARK_VALUE,
    label: 'Авто',
    searchLabel: 'Авто',
    mark: null,
    optionSource: 'builtin',
  },
  {
    value: `builtin::${encodeURIComponent('ТЛТ-25')}`,
    label: 'ТЛТ-25 · 25 Вт/м',
    searchLabel: 'ТЛТ-25 · 25 Вт/м',
    mark: 'ТЛТ-25',
    optionSource: 'builtin',
    cableSource: 'builtin',
  },
];

function setup(overrides: Partial<Parameters<typeof ElecCalcCableMarkModal>[0]> = {}) {
  const props = {
    object: projectObject(),
    selectedCable: cableRow(),
    cableType: 'self_regulating' as const,
    cableTypeOptions: [
      { label: 'Саморегулирующийся', value: 'self_regulating' as const },
    ],
    commercialFeaturesAvailable: true,
    projectSelected: true,
    pending: false,
    value: markOptions[1].value,
    markOptions,
    targetVariants: [ER_1_ID],
    targetVariantOptions: [
      { label: 'ЭР1', value: ER_1_ID, disabled: false },
      { label: 'ЭР «Лето»', value: ER_2_ID, disabled: false },
      {
        label: 'ЭР «Резерв» — недоступен: перенос марки ещё не поддерживает этот ЭР',
        value: ER_5_ID,
        disabled: true,
      },
    ],
    renderTypeControls: vi.fn(() => <div data-testid="type-controls">type controls</div>),
    onCableTypeChange: vi.fn(),
    onMarkChange: vi.fn(),
    onTargetVariantsChange: vi.fn(),
    onApply: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(<ElecCalcCableMarkModal {...props} />),
  };
}

describe('ElecCalcCableMarkModal', () => {
  it('renders named UUID-backed ER targets and an accessible compatibility explanation', () => {
    const { props } = setup();

    const dialog = screen.getByRole('dialog', { name: /Выбор марки кабеля/ });
    expect(within(dialog).getByText('Труба-1')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Характеристики объекта и кабеля')).toBeInTheDocument();
    expect(within(dialog).getAllByLabelText('Тип кабеля для выбора марки').length)
      .toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Марка').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Сохранить в ЭР')).toBeInTheDocument();

    const targetGroup = within(dialog).getByRole('group', { name: 'Сохранить в ЭР' });
    expect(targetGroup).toHaveAttribute(
      'aria-describedby',
      'electrical-cable-target-variants-help',
    );
    expect(within(targetGroup).getByRole('checkbox', { name: 'ЭР1' })).toBeChecked();
    expect(within(targetGroup).getByRole('checkbox', { name: 'ЭР «Лето»' }))
      .not.toBeChecked();
    expect(within(targetGroup).getByRole('checkbox', { name: /ЭР «Резерв».*недоступен/ }))
      .toBeDisabled();
    expect(within(dialog).getByText(/Авто.*автоподбор.*выбранных ЭР/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Недоступные ЭР.*расчётном сервисе/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('type-controls')).toBeInTheDocument();
    expect(props.renderTypeControls).toHaveBeenCalledWith('self_regulating');
  });

  it('keeps apply disabled for invalid objects, no targets, or lifecycle-only targets', () => {
    const { rerender, props } = setup({
      object: projectObject({ is_valid: false }),
      targetVariants: [],
    });

    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();

    rerender(
      <ElecCalcCableMarkModal
        {...props}
        object={projectObject()}
        targetVariants={[ER_1_ID, ER_5_ID]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
  });

  it('delegates cancel and UUID target changes to callbacks', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const dialog = screen.getByRole('dialog', { name: /Выбор марки кабеля/ });

    await user.click(within(dialog).getByRole('checkbox', { name: 'ЭР «Лето»' }));
    expect(props.onTargetVariantsChange).toHaveBeenCalledWith([ER_1_ID, ER_2_ID]);

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal inspectable but disables every write control in read-only mode', () => {
    const { props } = setup({ projectSelected: false });
    const dialog = screen.getByRole('dialog', { name: /Выбор марки кабеля/ });

    expect(within(dialog).getByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
    expect(within(dialog).getAllByLabelText('Тип кабеля для выбора марки')[0])
      .toHaveClass('ant-select-disabled');
    expect(within(dialog).getByRole('checkbox', { name: 'ЭР1' })).toBeDisabled();

    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onCableTypeChange).not.toHaveBeenCalled();
    expect(props.onTargetVariantsChange).not.toHaveBeenCalled();
  });
});
