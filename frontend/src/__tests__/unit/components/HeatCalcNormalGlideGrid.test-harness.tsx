/**
 * Shared harness for HeatCalcNormalGlideGrid scenario tests.
 * No test registration — import this module first, then import the SUT.
 */
import React from 'react';
import { vi } from 'vitest';
import type { ProjectObject } from '@/types/project';

const hoisted = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  updateCells: vi.fn(),
}));

/** Live mock bag. Import this harness before the grid SUT. */
export const normalGlideMock = hoisted as {
  props: Record<string, unknown> | null;
  updateCells: ReturnType<typeof vi.fn>;
};

vi.mock('@glideapps/glide-data-grid', () => {
  class MockCompactSelection {
    private readonly values: number[];

    private constructor(values: number[]) {
      this.values = values;
    }

    static empty() {
      return new MockCompactSelection([]);
    }

    add(value: number) {
      return new MockCompactSelection([...this.values, value]);
    }

    toArray() {
      return this.values;
    }
  }

  return {
    CompactSelection: MockCompactSelection,
    DataEditor: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({
        getBounds: () => ({ x: 10, y: 20, width: 180, height: 30 }),
        updateCells: hoisted.updateCells,
      }));
      hoisted.props = props;
      return React.createElement('div', { 'data-testid': 'normal-glide-data-editor' });
    }),
    GridCellKind: {
      Number: 'number',
      Text: 'text',
    },
  };
});

vi.mock('@/components/heatcalc/HeatCalcColumnFilterDropdown', () => ({
  default: (props: {
    title: string;
    onApply: (filter?: { kind: 'text'; value: string }) => void;
    onClose: () => void;
  }) => React.createElement(
    'button',
    {
      type: 'button',
      'data-testid': 'normal-glide-filter-apply',
      onClick: () => {
        props.onApply({ kind: 'text', value: 'Pipe' });
        props.onClose();
      },
    },
    props.title,
  ),
}));

export const heatCalcNormalGlideRows = [
  {
    id: 'row-1',
    project_id: 'project-1',
    object_type: 'pipe',
    params: { name: 'Pipe 1' },
    results: null,
    is_valid: true,
    validation_errors: null,
    sort_order: 1,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'row-2',
    project_id: 'project-1',
    object_type: 'pipe',
    params: { name: 'Pipe 2' },
    results: null,
    is_valid: true,
    validation_errors: null,
    sort_order: 2,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
] as ProjectObject[];
