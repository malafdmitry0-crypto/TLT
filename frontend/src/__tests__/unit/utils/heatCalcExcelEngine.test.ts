import { describe, expect, it } from 'vitest';

import {
  HEATCALC_EXCEL_ENGINE_STORAGE_KEY,
  resolveHeatCalcExcelEngine,
} from '@/utils/heatCalcExcelEngine';

function storageWith(value: string | null) {
  return {
    getItem: (key: string) => {
      if (key === HEATCALC_EXCEL_ENGINE_STORAGE_KEY) return value;
      return null;
    },
  };
}

describe('heatCalcExcelEngine', () => {
  it('uses Glide as the default Excel engine', () => {
    expect(resolveHeatCalcExcelEngine({ search: '', storage: storageWith(null) })).toBe('glide');
  });

  it('enables the Glide canvas engine from the query string', () => {
    expect(resolveHeatCalcExcelEngine({
      search: '?excelEngine=glide',
      storage: storageWith('table'),
    })).toBe('glide');
  });

  it('allows the table engine fallback from the query string', () => {
    expect(resolveHeatCalcExcelEngine({
      search: '?excelEngine=table',
      storage: storageWith('glide'),
    })).toBe('table');
  });

  it('falls back to localStorage when query string does not choose an engine', () => {
    expect(resolveHeatCalcExcelEngine({
      search: '?project=1',
      storage: storageWith('table'),
    })).toBe('table');
  });

  it('ignores unknown engine values', () => {
    expect(resolveHeatCalcExcelEngine({
      search: '?excelEngine=canvas',
      storage: storageWith('unknown'),
    })).toBe('glide');
  });
});
