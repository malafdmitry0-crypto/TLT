import { describe, expect, it } from 'vitest';

import {
  countManualCableRows,
  countValidSelectedObjects,
  filterVisibleSelectedRowKeys,
  formatSelectedRecalcCountLabel,
  objectIdsForSelection,
  selectedObjectsForKeys,
  selectedRecalcDisabledTooltip,
} from '@/pages/electrical/elecCalcSelectionModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function object(id: string, isValid = true): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {},
    results: null,
    is_valid: isValid,
    validation_errors: null,
    created_at: '',
    updated_at: '',
  };
}

function calc(objectId: string, source: 'auto' | 'manual'): ElectricalCalcSummary {
  return {
    id: `calc-${objectId}`,
    object_id: objectId,
    cable_type: 'self_regulating',
    cable_mark: source === 'manual' ? 'ТЛТ-60' : 'ТЛТ-10',
    cable_mark_source: source,
    variant_number: 1,
    results: {},
  };
}

describe('elecCalcSelectionModel', () => {
  it('keeps only selected row keys that are visible', () => {
    const selected = ['obj-1', 'obj-3'];
    const filtered = filterVisibleSelectedRowKeys(selected, [
      object('obj-1'),
      object('obj-2'),
    ]);

    expect(filtered).toEqual(['obj-1']);
    const unchanged = ['obj-1'];
    expect(filterVisibleSelectedRowKeys(unchanged, [object('obj-1')])).toBe(unchanged);
  });

  it('builds selected objects and valid counts from selected keys', () => {
    const objects = [object('obj-1'), object('obj-2', false), object('obj-3')];
    const selected = selectedObjectsForKeys(objects, ['obj-3', 'obj-2']);

    expect(selected.map((item) => item.id)).toEqual(['obj-2', 'obj-3']);
    expect(countValidSelectedObjects(selected)).toBe(1);
    expect(objectIdsForSelection(selected)).toEqual(['obj-2', 'obj-3']);
  });

  it('counts manual cable rows by selected object ids', () => {
    expect(countManualCableRows(['obj-1', 'obj-2', 'obj-3'], {
      'obj-1': calc('obj-1', 'manual'),
      'obj-2': calc('obj-2', 'auto'),
      'obj-3': {
        ...calc('obj-3', 'auto'),
        cable_mark_source: null,
        params: { cable_mark_source: 'manual' },
      },
    })).toBe(2);
  });

  it('formats selected recalculation labels and tooltip', () => {
    expect(formatSelectedRecalcCountLabel(3, 2)).toBe('2/3');
    expect(formatSelectedRecalcCountLabel(2, 2)).toBe('2');
    expect(selectedRecalcDisabledTooltip(2, 0)).toBe(
      'Сначала рассчитайте теплопотери для выбранных объектов',
    );
    expect(selectedRecalcDisabledTooltip(0, 0)).toBeUndefined();
    expect(selectedRecalcDisabledTooltip(2, 1)).toBeUndefined();
  });
});
