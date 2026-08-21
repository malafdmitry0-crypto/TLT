// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildHeatEditorColumns,
  buildHeatGlideTheme,
  buildHeatGridCell,
  isNearScrollEnd,
  resolveFullRowSelectionBounds,
  resolveHeatCellBg,
  resolveHeatRowTheme,
} from '@/components/heatcalc/heatCalcGlideGridAdapters';
import type { HeatCalcGlideGridColumn } from '@/utils/heatCalcGlideGrid';

const nameColumn: HeatCalcGlideGridColumn = {
  key: 'name',
  title: 'Name',
  width: 180,
};

describe('heatCalcGlideGridAdapters', () => {
  it('builds editor columns and text cells with dirty/error backgrounds', () => {
    expect(buildHeatEditorColumns([nameColumn])).toEqual([
      { id: 'name', title: 'Name', width: 180 },
    ]);

    expect(resolveHeatCellBg(
      { displayValue: 'x', editable: true, dirty: true },
      '',
    )).toBe('#fffbe6');
    expect(resolveHeatCellBg(
      { displayValue: 'x', editable: true, error: 'bad' },
      '',
    )).toBe('#fff1f0');

    expect(buildHeatGridCell(
      nameColumn,
      { displayValue: 'Pipe 108', editable: true, dirty: true, align: 'right' },
      '',
    )).toMatchObject({
      kind: 'text',
      data: 'Pipe 108',
      readonly: false,
      contentAlign: 'right',
      themeOverride: { bgCell: '#fffbe6' },
    });
  });

  it('resolves full-row selection bounds only when every column is covered', () => {
    const rows = [{ id: 'row-1' }, { id: 'row-2' }, { id: 'row-3' }];
    const columnKeys = ['name', 'diameter', 'temperature'];

    expect(resolveFullRowSelectionBounds({
      rows,
      columnKeys,
      selectionRange: {
        anchor: { rowId: 'row-2', columnKey: 'name' },
        focus: { rowId: 'row-3', columnKey: 'temperature' },
      },
    })).toEqual({ top: 1, bottom: 2 });

    expect(resolveFullRowSelectionBounds({
      rows,
      columnKeys,
      selectionRange: {
        anchor: { rowId: 'row-1', columnKey: 'name' },
        focus: { rowId: 'row-1', columnKey: 'diameter' },
      },
    })).toBeNull();
  });

  it('resolves row themes, scroll-end threshold, and theme fonts', () => {
    expect(resolveHeatRowTheme({
      rowClassName: 'row-error',
      rowIndex: 0,
      fullRowSelectionBounds: null,
    })).toEqual({ bgCell: '#fff1f0' });

    expect(resolveHeatRowTheme({
      rowClassName: '',
      rowIndex: 1,
      fullRowSelectionBounds: { top: 1, bottom: 2 },
    })).toMatchObject({ bgCell: '#dbeeff' });

    expect(isNearScrollEnd({ y: 10, height: 8 }, 20)).toBe(true);
    expect(isNearScrollEnd({ y: 0, height: 4 }, 20)).toBe(false);

    expect(buildHeatGlideTheme(13)).toMatchObject({
      baseFontStyle: '13px inherit',
      headerFontStyle: '600 13px inherit',
    });
  });
});
