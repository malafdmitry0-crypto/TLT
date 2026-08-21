// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildRowSelection,
  clampNormalGlideColumnWidth,
  glideRowHeight,
  normalStatusVisualFromValue,
} from '@/utils/heatCalcNormalGlidePureModel';
import type { ProjectObject } from '@/types/project';

function row(id: string): ProjectObject {
  return {
    id,
    project_id: 'p',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {},
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('heatCalcNormalGlidePureModel (GRID1)', () => {
  it('maps status labels to visual tokens', () => {
    expect(normalStatusVisualFromValue('Рассчитан')).toBe('calculated');
    expect(normalStatusVisualFromValue('Ошибка')).toBe('error');
    expect(normalStatusVisualFromValue('—')).toBe('not_calculated');
  });

  it('clamps column width to min and builds multi-row selection', () => {
    expect(clampNormalGlideColumnWidth({ key: 'a', title: 'A', width: 120 }, 10)).toBe(48);
    const selection = buildRowSelection([row('a'), row('b'), row('c')], ['a', 'c'], [0, 0]);
    expect(selection.rows.hasIndex(0)).toBe(true);
    expect(selection.rows.hasIndex(1)).toBe(false);
    expect(selection.rows.hasIndex(2)).toBe(true);
    expect(selection.current?.cell).toEqual([0, 0]);
  });

  it('computes positive glide row height from font key', () => {
    expect(glideRowHeight('medium')).toBeGreaterThanOrEqual(26);
  });
});
