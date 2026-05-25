import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnType } from 'antd/es/table';

import HeatCalcExcelGrid from '@/components/heatcalc/HeatCalcExcelGrid';
import type { ProjectObject } from '@/types/project';

function makePipe(index: number): ProjectObject {
  return {
    id: `pipe-${index}`,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: index,
    version: 1,
    params: {
      name: `Pipe ${index}`,
      outer_diameter: 0.108,
      pipe_length: 50,
    },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('HeatCalcExcelGrid', () => {
  it('keeps large Excel tables windowed instead of rendering every row into DOM', () => {
    const rows = Array.from({ length: 1000 }, (_, index) => makePipe(index));
    const columns: ColumnType<ProjectObject>[] = [
      {
        key: 'name',
        title: 'Название',
        width: 160,
        render: (_value, record) => String(record.params.name),
      },
      {
        key: 'pipe_length',
        title: 'Длина',
        width: 80,
        render: (_value, record) => String(record.params.pipe_length),
      },
    ];

    const { container } = render(
      <HeatCalcExcelGrid
        rows={rows}
        columns={columns}
        tableScrollX={240}
        tableScrollY="320px"
        fontSizeKey="standard"
        selectedRowIndex={null}
        emptyContent="Нет строк"
        rowClassName={() => ''}
        onRowSecondaryAction={vi.fn()}
      />,
    );

    const renderedRows = container.querySelectorAll('tbody tr.ant-table-row');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(1000);
    expect(renderedRows.length).toBeLessThanOrEqual(80);
    expect(screen.getByText('Pipe 0')).toBeInTheDocument();
    expect(screen.queryByText('Pipe 999')).not.toBeInTheDocument();
  });

  it('requests more input rows when the user scrolls the Excel sheet bottom', () => {
    const rows = Array.from({ length: 30 }, (_, index) => makePipe(index));
    const onReachScrollEnd = vi.fn();
    const { container } = render(
      <HeatCalcExcelGrid
        rows={rows}
        columns={[{
          key: 'name',
          title: 'Название',
          width: 160,
          render: (_value, record) => String(record.params.name),
        }]}
        tableScrollX={160}
        tableScrollY="320px"
        fontSizeKey="standard"
        selectedRowIndex={null}
        emptyContent="Нет строк"
        rowClassName={() => ''}
        onRowSecondaryAction={vi.fn()}
        onReachScrollEnd={onReachScrollEnd}
      />,
    );
    const body = container.querySelector<HTMLDivElement>('.excel-virtual-table-body');
    expect(body).not.toBeNull();
    Object.defineProperty(body, 'scrollTop', { value: 680, configurable: true });
    Object.defineProperty(body, 'clientHeight', { value: 320, configurable: true });
    Object.defineProperty(body, 'scrollHeight', { value: 1_000, configurable: true });

    fireEvent.scroll(body!);
    fireEvent.scroll(body!);
    expect(onReachScrollEnd).toHaveBeenCalledTimes(1);

    Object.defineProperty(body, 'scrollHeight', { value: 1_600, configurable: true });
    Object.defineProperty(body, 'scrollTop', { value: 1_280, configurable: true });
    fireEvent.wheel(body!, { deltaY: 240 });
    expect(onReachScrollEnd).toHaveBeenCalledTimes(2);
  });
});
