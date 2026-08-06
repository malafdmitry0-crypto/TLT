import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import { useElecCalcElectricalColumnRenderers } from '@/pages/electrical/useElecCalcElectricalColumnRenderers';

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {},
    results: {},
    is_valid: true,
    validation_errors: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    cable_mark_source: 'auto',
    variant_number: 1,
    params: {},
    results: { selected_cable: 'ТЛТ-25' },
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(
  options: Partial<Parameters<typeof useElecCalcElectricalColumnRenderers>[0]> = {},
) {
  const openCableMarkModal = vi.fn();
  const openCableSizingModal = vi.fn();

  return {
    openCableMarkModal,
    openCableSizingModal,
    ...renderHook(() => useElecCalcElectricalColumnRenderers({
      activeRowId: null,
      calcByObjectId: { 'object-1': calc() },
      electricalDisplayOffset: 10,
      getCalculatedCableTypeForObject: () => 'self_regulating',
      isCableMarkPending: false,
      projectSelected: true,
      canMutate: true,
      recalc: {
        connectionType: 'line_1ph',
        supplyVoltage: 220,
        windingCoefficient: null,
      },
      openCableMarkModal,
      openCableSizingModal,
      ...options,
    })),
  };
}

describe('useElecCalcElectricalColumnRenderers', () => {
  it('keeps passive cable mark cells read-only', () => {
    const { result } = setup();

    render(<>{result.current.cable_mark.render(undefined, projectObject(), 0)}</>);

    expect(screen.getByText('ТЛТ-25')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выбор' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подбор' })).not.toBeInTheDocument();
  });

  it('routes active cable mark buttons through page callbacks', async () => {
    const row = projectObject();
    const { result, openCableMarkModal, openCableSizingModal } = setup({
      activeRowId: row.id,
    });

    render(<>{result.current.cable_mark.render(undefined, row, 0)}</>);
    await userEvent.click(screen.getByRole('button', { name: 'Выбор' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подбор' }));

    expect(openCableMarkModal).toHaveBeenCalledWith(row);
    expect(openCableSizingModal).toHaveBeenCalledWith(row);
  });

  it('preserves disabled states for invalid rows and missing project', () => {
    const invalid = setup({ activeRowId: 'object-1' });

    const invalidRender = render(
      <>{invalid.result.current.cable_mark.render(undefined, projectObject({ is_valid: false }), 0)}</>,
    );
    expect(screen.getByRole('button', { name: 'Выбор' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Подбор' })).not.toBeDisabled();
    invalidRender.unmount();

    const noProject = setup({
      activeRowId: 'object-1',
      projectSelected: false,
    });
    render(<>{noProject.result.current.cable_mark.render(undefined, projectObject(), 0)}</>);
    expect(screen.getByRole('button', { name: 'Выбор' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Подбор' })).toBeDisabled();
  });

  it('disables cable writes but keeps candidate inspection for read-only projects', async () => {
    const row = projectObject();
    const { result, openCableMarkModal, openCableSizingModal } = setup({
      activeRowId: row.id,
      canMutate: false,
    });

    render(<>{result.current.cable_mark.render(undefined, row, 0)}</>);

    const choose = screen.getByRole('button', { name: 'Выбор' });
    const sizing = screen.getByRole('button', { name: 'Подбор' });
    expect(choose).toBeDisabled();
    expect(sizing).not.toBeDisabled();

    await userEvent.click(choose);
    await userEvent.click(sizing);

    expect(openCableMarkModal).not.toHaveBeenCalled();
    expect(openCableSizingModal).toHaveBeenCalledWith(row);
  });

  it('keeps electrical status labels for success, unsupported, stale, error and empty states', () => {
    const cases: Array<[ElectricalCalcSummary | undefined, string]> = [
      [calc(), 'Рассчитан'],
      [calc({ cable_mark: null, results: { category: 'unsupported', message: 'Не применимо' } }), 'Не применимо'],
      [calc({ cable_mark: null, results: { category: 'stale', stale: true } }), 'Требуется пересчёт'],
      [calc({ cable_mark: null, results: { category: 'formula', message: 'Слишком большая мощность' } }), 'Ошибка'],
      [undefined, 'Не рассчитан'],
    ];

    cases.forEach(([rowCalc, label]) => {
      const { result } = setup({
        calcByObjectId: rowCalc ? { 'object-1': rowCalc } : {},
      });
      const { container, unmount } = render(
        <>{result.current.electrical_status.render(undefined, projectObject(), 0)}</>,
      );

      expect(container.querySelector(`[aria-label="${label}"]`)).toBeInTheDocument();
      unmount();
    });
  });

  it('preserves layout renderers for pitch and thread count', () => {
    const { result } = setup({
      calcByObjectId: {
        'object-1': calc({
          results: {
            selected_cable: 'ТЛТ-25',
            winding_pitch: 60,
            num_circuits: 2,
            number_of_threads_source: 'manual',
          },
        }),
      },
    });

    render(<>{result.current.winding_pitch_mm.render(undefined, projectObject(), 0)}</>);
    expect(screen.getByText('60')).toBeInTheDocument();

    render(<>{result.current.number_of_threads.render(undefined, projectObject(), 0)}</>);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('ручн.')).toBeInTheDocument();
  });

  it('renders tank layout only from the row calculation params', () => {
    const row = projectObject({ object_type: 'tank' });
    const { result } = setup({
      calcByObjectId: {
        'object-1': calc({
          params: {
            heating_height: 2.5,
            laying_step: 0.15,
          },
        }),
      },
    });

    const height = render(<>{result.current.heating_height.render(undefined, row, 0)}</>);
    expect(screen.getByText('2,5')).toBeInTheDocument();
    height.unmount();

    render(<>{result.current.laying_step.render(undefined, row, 0)}</>);
    expect(screen.getByText('0,15')).toBeInTheDocument();
  });
});
