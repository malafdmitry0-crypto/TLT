import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useHeatCalcExcelClipboard } from '@/hooks/useHeatCalcExcelClipboard';
import type { ProjectObject } from '@/types/project';
import { createExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';
import type { HeatCalcResolvedColumnMeta } from '@/utils/heatCalcTableColumns';

const clipboardMocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async () => undefined),
  readFromClipboard: vi.fn(async () => ''),
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: clipboardMocks.copyToClipboard,
  readFromClipboard: clipboardMocks.readFromClipboard,
}));

function makePipe(id: string, pipeLength = 25): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: Number(id.replace(/\D/g, '') || 0),
    version: 1,
    params: {
      name: `Pipe ${id}`,
      placement: 'outdoor',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: pipeLength,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      process_temperature: 60,
      ambient_temperature: -20,
      max_ambient_temperature: 35,
      max_process_temperature: 110,
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T3',
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.2,
      steam_tracing: 'no',
    },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function column(key: string): HeatCalcResolvedColumnMeta {
  return {
    key,
    labels: { short: key, full: key, compact: key },
    label: key,
    title: key,
    group: 'test',
    width: 80,
    defaultWidthPct: 8,
    minWidthPx: 40,
    widthPct: 8,
    visible: true,
  };
}

function renderClipboardHook(options: {
  rows?: ProjectObject[];
  draftRowsById?: DraftRowsById;
  setDraftRowsById?: ReturnType<typeof vi.fn>;
}) {
  const rows = options.rows ?? [makePipe('r0'), makePipe('r1'), makePipe('r2')];
  const setDraftRowsById = options.setDraftRowsById ?? vi.fn();
  return {
    ...renderHook(() => useHeatCalcExcelClipboard({
      excelModeEnabled: true,
      rows,
      sourceColumnMetas: [column('name'), column('pipe_length')],
      draftRowsById: options.draftRowsById ?? {},
      setDraftRowsById: setDraftRowsById as unknown as Dispatch<SetStateAction<DraftRowsById>>,
      selectionRange: createExcelSelectionRange(
        { rowId: 'r2', columnKey: 'pipe_length' },
        { rowId: 'r2', columnKey: 'pipe_length' },
      ),
      activeCell: null,
      appendLocalRows: vi.fn(() => []),
      cellDisplayValue: (record, columnKey) => `${record.id}:${columnKey}`,
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
      notifyInfo: vi.fn(),
    })),
    rows,
    setDraftRowsById,
  };
}

describe('useHeatCalcExcelClipboard', () => {
  beforeEach(() => {
    clipboardMocks.copyToClipboard.mockClear();
    clipboardMocks.readFromClipboard.mockClear();
  });

  it('копирует выделение по rowId из полной модели строк, а не из DOM-страницы', async () => {
    const { result } = renderClipboardHook({});

    await act(async () => {
      await result.current.copySelection();
    });

    expect(clipboardMocks.copyToClipboard).toHaveBeenCalledWith('r2:pipe_length');
  });

  it('вставляет блок одним batch update в draftRowsById по rowId', () => {
    const setDraftRowsById = vi.fn();
    const { result } = renderClipboardHook({ setDraftRowsById });

    act(() => {
      result.current.applyPaste('88,5');
    });

    expect(setDraftRowsById).toHaveBeenCalledTimes(1);
    const nextDraftRows = setDraftRowsById.mock.calls[0][0] as DraftRowsById;
    expect(nextDraftRows.r2?.dirtyFields).toHaveProperty('pipe_length', 88.5);
    expect(nextDraftRows.r0).toBeUndefined();
    expect(nextDraftRows.r1).toBeUndefined();
  });

  it('очищает только выбранные id-based ячейки одним updater без обхода DOM', () => {
    const setDraftRowsById = vi.fn();
    const { result } = renderClipboardHook({ setDraftRowsById });

    act(() => {
      result.current.clearSelection();
    });

    expect(setDraftRowsById).toHaveBeenCalledTimes(1);
    const updater = setDraftRowsById.mock.calls[0][0] as (current: DraftRowsById) => DraftRowsById;
    const nextDraftRows = updater({});
    expect(nextDraftRows.r2?.dirtyFields).toHaveProperty('pipe_length');
    expect(nextDraftRows.r0).toBeUndefined();
    expect(nextDraftRows.r1).toBeUndefined();
  });
});
