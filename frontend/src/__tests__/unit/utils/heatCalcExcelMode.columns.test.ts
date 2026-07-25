import { describe, expect, it } from 'vitest';
import {
  getExcelEditableColumnMetas,
} from '@/utils/heatCalcExcelMode';
import {
  getAllTableColumnMetas,
  getDefaultTableColumnSettings,
  getVisibleTableColumnMetas,
  moveTableColumnToOrder,
  setTableColumnVisibility,
} from '@/utils/heatCalcTableColumns';

describe('heatCalcExcelMode — editable columns', () => {

  it('оставляет в Excel-режиме только заполняемые колонки трубы', () => {
    const columns = getAllTableColumnMetas('pipe', getDefaultTableColumnSettings());
    const keys = getExcelEditableColumnMetas('pipe', columns).map((column) => column.key);

    expect(keys).toContain('pipe_outer_diameter');
    expect(keys).toContain('pipe_length');
    expect(keys).toContain('supply_voltage');
    expect(keys).not.toContain('index');
    expect(keys).not.toContain('heat_loss_status');
    expect(keys).not.toContain('heat_loss_per_meter');
    expect(keys).not.toContain('total_heat_loss');
    expect(keys).not.toContain('pipe_dn');
  });

  it('оставляет в Excel-режиме только заполняемые колонки резервуара', () => {
    const columns = getAllTableColumnMetas('tank', getDefaultTableColumnSettings());
    const keys = getExcelEditableColumnMetas('tank', columns).map((column) => column.key);

    expect(keys).toContain('tank_diameter');
    expect(keys).toContain('tank_height');
    expect(keys).not.toContain('index');
    expect(keys).not.toContain('heat_loss_status');
    expect(keys).not.toContain('heat_loss_per_m2');
    expect(keys).not.toContain('total_heat_loss');
    expect(keys).not.toContain('tank_shape');
  });

  it('берёт скрытые пользователем editable-колонки в Excel-режим без изменения обычной таблицы', () => {
    const settings = setTableColumnVisibility(
      moveTableColumnToOrder(getDefaultTableColumnSettings(), 'pipe', 'pipe_length', 3),
      'pipe',
      'pipe_length',
      false,
    );
    const normalKeys = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);
    const excelKeys = getExcelEditableColumnMetas('pipe', getAllTableColumnMetas('pipe', settings))
      .map((column) => column.key);

    expect(normalKeys).not.toContain('pipe_length');
    expect(excelKeys).toContain('pipe_length');
  });

});
