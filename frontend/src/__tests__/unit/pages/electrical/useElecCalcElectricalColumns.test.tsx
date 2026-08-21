import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectricalColumnRenderSpec } from '@/pages/electrical/elecCalcPageModel';
import { useElecCalcElectricalColumns } from '@/pages/electrical/useElecCalcElectricalColumns';
import type { ObjectQueryFieldCapability } from '@/types/project';
import type { ProjectObject } from '@/types/project';
import type {
  ElectricalColumnKey,
  ElectricalResolvedColumnMeta,
} from '@/utils/electricalTableColumns';
import { createEmptyTableViewState } from '@/utils/heatCalcTableFindability';

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

function column(
  key: ElectricalColumnKey,
  overrides: Partial<ElectricalResolvedColumnMeta> = {},
): ElectricalResolvedColumnMeta {
  return {
    key,
    labels: {
      short: key,
      full: key,
      compact: key,
    },
    label: key,
    title: key,
    group: 'Основные',
    source: 'test',
    valueType: 'computed',
    width: 120,
    defaultWidthPct: 10,
    widthPct: 10,
    minWidthPx: 80,
    visible: true,
    ...overrides,
  };
}

function capability(
  key: ElectricalColumnKey,
  overrides: Partial<ObjectQueryFieldCapability> = {},
): ObjectQueryFieldCapability {
  return {
    key,
    label: key,
    title: key,
    data_type: 'text',
    unit: null,
    filter: {
      enabled: true,
      ops: ['contains'],
      include_empty: false,
    },
    sort: {
      enabled: true,
      type: 'text',
      nulls: null,
      collation: null,
      reason: null,
    },
    options: null,
    ...overrides,
  };
}

function setup(
  options: Partial<Parameters<typeof useElecCalcElectricalColumns>[0]> = {},
) {
  const onColumnResizeStart = vi.fn();
  const onSetColumnFilter = vi.fn();
  const onResetColumnFilter = vi.fn();
  const renderObjectName = vi.fn(() => <span>Объект из renderer</span>);
  const electricalColumnRenderers: Record<ElectricalColumnKey, ElectricalColumnRenderSpec> = {
    object_name: {
      ellipsis: true,
      render: renderObjectName,
    },
    total_power: {
      align: 'right',
      render: () => '1,20 кВт',
    },
  };

  return {
    onColumnResizeStart,
    onSetColumnFilter,
    onResetColumnFilter,
    renderObjectName,
    ...renderHook(() => useElecCalcElectricalColumns({
      visibleElectricalColumnMetas: [
        column('index'),
        column('object_name'),
        column('total_power'),
      ],
      electricalColumnRenderers,
      fieldCapabilityByKey: new Map([
        ['index', capability('index')],
        ['object_name', capability('object_name')],
        ['total_power', capability('total_power', {
          data_type: 'number',
          filter: { enabled: true, ops: ['range'], include_empty: true },
          sort: { enabled: true, type: 'number', nulls: 'last', collation: null, reason: null },
        })],
      ]),
      enumOptionsByColumn: {},
      tableViewState: createEmptyTableViewState(),
      onColumnResizeStart,
      onSetColumnFilter,
      onResetColumnFilter,
      ...options,
    })),
  };
}

describe('useElecCalcElectricalColumns', () => {
  it('delegates cell rendering and renderer metadata', () => {
    const row = projectObject();
    const { result, renderObjectName } = setup();
    const objectColumn = result.current.find((item) => item.key === 'object_name');
    const totalPowerColumn = result.current.find((item) => item.key === 'total_power');

    render(<>{objectColumn?.render?.(undefined, row, 0)}</>);

    expect(screen.getByText('Объект из renderer')).toBeInTheDocument();
    expect(renderObjectName).toHaveBeenCalledWith(undefined, row, 0);
    expect(objectColumn).toMatchObject({ ellipsis: true });
    expect(totalPowerColumn).toMatchObject({ align: 'right' });
  });

  it('keeps sorter and index guards unchanged', () => {
    const { result } = setup({
      tableViewState: {
        filters: {},
        sort: { columnKey: 'total_power', direction: 'desc' },
      },
    });
    const indexColumn = result.current.find((item) => item.key === 'index');
    const totalPowerColumn = result.current.find((item) => item.key === 'total_power');

    expect(indexColumn).toMatchObject({
      sorter: false,
      filterIcon: undefined,
      filterDropdown: undefined,
    });
    expect(totalPowerColumn).toMatchObject({
      sorter: true,
      sortOrder: 'descend',
    });
  });

  it('wires filter dropdown apply/reset callbacks to the column key', async () => {
    const close = vi.fn();
    const { result, onSetColumnFilter, onResetColumnFilter } = setup({
      tableViewState: {
        filters: {
          object_name: { kind: 'text', value: 'Насос' },
        },
      },
    });
    const objectColumn = result.current.find((item) => item.key === 'object_name');
    const filterDropdown = objectColumn?.filterDropdown as (
      props: { close: () => void },
    ) => ReactNode;
    const filterIcon = objectColumn?.filterIcon as (filtered: boolean) => ReactNode;

    const iconRender = render(<>{filterIcon(true)}</>);
    expect(screen.getByRole('button', { name: 'Фильтр object_name' }))
      .toHaveClass('table-filter-trigger');
    iconRender.unmount();

    const applyRender = render(<>{filterDropdown({ close })}</>);
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onSetColumnFilter).toHaveBeenCalledWith('object_name', {
      kind: 'text',
      value: 'Насос',
    });
    expect(close).toHaveBeenCalled();
    applyRender.unmount();

    render(<>{filterDropdown({ close })}</>);
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(onResetColumnFilter).toHaveBeenCalledWith('object_name');
  });
});
