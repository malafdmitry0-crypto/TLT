import './useHeatCalcObjectsDataModel.test-harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getObjectQueryCapabilities,
  getObjectsSummary,
  listObjects,
  queryObjects,
} from '@/api/projects';
import { getInsulation } from '@/api/references';
import {
  buildHeatCalcEnumOptionsByColumn,
  buildHeatCalcVisibleRowsModel,
} from '@/pages/heatcalc/useHeatCalcObjectsDataModel';
import {
  makeCapabilities,
  makeObject,
  makeQueryResponse,
  meta,
} from './useHeatCalcObjectsDataModel.test-harness';
import { INAPPLICABLE_TABLE_VALUE } from '@/utils/heatCalcPageUtils';

describe('useHeatCalcObjectsDataModel — visible rows model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: undefined });
    Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: undefined });
    (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 2,
      valid: 2,
      invalid: 0,
      by_type: { pipe: 2, tank: 0 },
      valid_by_type: { pipe: 2, tank: 0 },
      electrical_calculations_total: 0,
      successful_electrical_calculations: 0,
      failed_electrical_calculations: 0,
      objects_with_successful_electrical_calculation: 0,
    });
    (getObjectQueryCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(makeCapabilities('pipe'));
    (queryObjects as ReturnType<typeof vi.fn>).mockResolvedValue(makeQueryResponse([
      makeObject({ id: 'pipe-1', sort_order: 1 }),
      makeObject({ id: 'pipe-2', sort_order: 2, params: { name: 'Beta pipe', placement: 'indoor' } }),
    ]));
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getInsulation as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('keeps Excel visible rows separate from base query rows', () => {
    const queryRow = makeObject({ id: 'query-row' });
    const excelBaseRow = makeObject({ id: 'base-row' });
    const excelRow = makeObject({ id: 'excel-row' });
    const excelTableRows: HeatCalcIndexedTableRow<ProjectObject>[] = [{ record: excelRow, sourceIndex: 7 }];

    const model = buildHeatCalcVisibleRowsModel({
      activeTableObjectType: 'pipe',
      excelBaseRows: [excelBaseRow],
      excelModeEnabled: true,
      excelRows: [excelRow],
      excelTableRows,
      isAllObjectScope: false,
      normalLoadedRowsByType: { pipe: [], tank: [] },
      objectQueryResult: makeQueryResponse([queryRow]),
      visibleAllTableRows: [],
    });

    expect(model.baseVisibleTableObjects).toEqual([excelBaseRow]);
    expect(model.visibleTableObjects).toEqual([excelRow]);
    expect(model.visibleTableRows).toEqual(excelTableRows);
    expect(model.visibleSourceIndexById.get('excel-row')).toBe(7);
  });

  it('uses loaded normal rows before first-page query rows', () => {
    const queryRow = makeObject({ id: 'query-row' });
    const loadedRow = makeObject({ id: 'loaded-row' });

    const model = buildHeatCalcVisibleRowsModel({
      activeTableObjectType: 'pipe',
      excelBaseRows: [],
      excelModeEnabled: false,
      excelRows: [],
      excelTableRows: [],
      isAllObjectScope: false,
      normalLoadedRowsByType: { pipe: [loadedRow], tank: [] },
      objectQueryResult: makeQueryResponse([queryRow]),
      visibleAllTableRows: [],
    });

    expect(model.baseVisibleTableObjects).toEqual([loadedRow]);
    expect(model.visibleTableRows).toEqual([{ record: loadedRow, sourceIndex: 0 }]);
  });

  it('deduplicates and sorts all-scope enum options while skipping inapplicable cells', () => {
    const rows: HeatCalcIndexedTableRow<ProjectObject>[] = [
      { record: makeObject({ id: 'one', params: { placement: 'outdoor' } }), sourceIndex: 0 },
      { record: makeObject({ id: 'two', params: { placement: 'indoor' } }), sourceIndex: 1 },
      { record: makeObject({ id: 'three', params: { placement: 'outdoor' } }), sourceIndex: 2 },
      { record: makeObject({ id: 'four', object_type: 'tank', params: { placement: '—' } }), sourceIndex: 3 },
    ];
    const accessors: HeatCalcColumnValueAccessors<ProjectObject> = {
      placement: (record) => record.params.placement === '—'
        ? INAPPLICABLE_TABLE_VALUE
        : record.params.placement,
    };

    const options = buildHeatCalcEnumOptionsByColumn({
      allIndexedTableRows: rows,
      fieldCapabilityByKey: new Map(),
      isAllObjectScope: true,
      sourceColumnMetas: [meta('placement')],
      tableValueAccessors: accessors,
    });

    expect(options.placement).toEqual([
      { label: 'indoor', value: 'indoor' },
      { label: 'outdoor', value: 'outdoor' },
    ]);
  });

});
