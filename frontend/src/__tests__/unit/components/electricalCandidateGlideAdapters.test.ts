// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildCandidateEditorColumns,
  buildCandidateGlideTheme,
  buildCandidateGridCell,
  isCandidateHeaderControlsVisible,
  isCandidateHeaderFilterHit,
  resolveCandidateCellBg,
  resolveCandidateRowTheme,
} from '@/components/electrical/electricalCandidateGlideAdapters';
import type { HeatCalcGlideGridColumn } from '@/utils/heatCalcGlideGrid';

const textColumn: HeatCalcGlideGridColumn = {
  key: 'cable_mark',
  title: 'Марка',
  width: 180,
  sortable: true,
  filterable: true,
};

const markedColumn: HeatCalcGlideGridColumn = {
  key: 'marked',
  title: 'Пометка',
  width: 72,
  align: 'center',
  filterable: true,
};

describe('electricalCandidateGlideAdapters', () => {
  it('maps grid columns to Glide editor columns and highlights active filters', () => {
    expect(buildCandidateEditorColumns([textColumn, markedColumn], {
      cable_mark: { kind: 'text', value: 'TLT' },
    })).toEqual([
      expect.objectContaining({
        id: 'cable_mark',
        title: 'Марка',
        width: 180,
        hasMenu: false,
        style: 'highlight',
      }),
      expect.objectContaining({
        id: 'marked',
        style: 'normal',
      }),
    ]);
  });

  it('builds text cells with error/diff backgrounds and clears special column displayData', () => {
    expect(resolveCandidateCellBg(
      { displayValue: 'TLT-30', editable: false, dirty: true },
      '',
    )).toBe('#fff7d6');
    expect(resolveCandidateCellBg(
      { displayValue: 'x', editable: false, error: 'bad' },
      '',
    )).toBe('#fff1f0');
    expect(resolveCandidateCellBg(
      { displayValue: 'x', editable: false },
      'electrical-cable-sizing-table__row--error',
    )).toBe('#fff1f0');

    expect(buildCandidateGridCell(
      textColumn,
      { displayValue: 'TLT-30', editable: false, dirty: true, align: 'right' },
      '',
    )).toMatchObject({
      kind: 'text',
      data: 'TLT-30',
      displayData: 'TLT-30',
      contentAlign: 'right',
      themeOverride: { bgCell: '#fff7d6' },
    });

    expect(buildCandidateGridCell(
      markedColumn,
      { displayValue: '1', editable: false },
      '',
    )).toMatchObject({
      data: '1',
      displayData: '',
    });
  });

  it('resolves row themes, filter hit zones, control visibility, and theme fonts', () => {
    expect(resolveCandidateRowTheme('electrical-cable-sizing-table__row--error'))
      .toEqual({ bgCell: '#fff1f0' });
    expect(resolveCandidateRowTheme('electrical-cable-sizing-table__row--compared'))
      .toEqual({ bgCell: '#f7fbff' });
    expect(resolveCandidateRowTheme('')).toBeUndefined();

    expect(isCandidateHeaderFilterHit(textColumn, 170, 180)).toBe(true);
    expect(isCandidateHeaderFilterHit(textColumn, 12, 180)).toBe(false);
    expect(isCandidateHeaderFilterHit({ ...textColumn, filterable: false }, 170, 180)).toBe(false);

    expect(isCandidateHeaderControlsVisible({
      columnIndex: 2,
      hoveredHeaderColumnIndex: null,
      sortDirection: 'asc',
    })).toBe(true);
    expect(isCandidateHeaderControlsVisible({
      columnIndex: 2,
      hoveredHeaderColumnIndex: null,
      filter: { kind: 'text', value: 'a' },
    })).toBe(true);
    expect(isCandidateHeaderControlsVisible({
      columnIndex: 2,
      hoveredHeaderColumnIndex: null,
    })).toBe(false);

    expect(buildCandidateGlideTheme(12)).toMatchObject({
      fontFamily: 'inherit',
      baseFontStyle: '12px inherit',
      headerFontStyle: '600 12px inherit',
    });
  });
});
