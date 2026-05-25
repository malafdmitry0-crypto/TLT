import { describe, expect, it } from 'vitest';

import {
  HEATCALC_EXCEL_ENGINE_STORAGE_KEY,
  HEATCALC_NORMAL_TABLE_ENGINE_STORAGE_KEY,
  resolveHeatCalcExcelEngine,
  resolveHeatCalcNormalTableEngine,
} from '@/utils/heatCalcExcelEngine';

function storageWith(value: string | null, normalValue: string | null = null) {
  return {
    getItem: (key: string) => {
      if (key === HEATCALC_EXCEL_ENGINE_STORAGE_KEY) return value;
      if (key === HEATCALC_NORMAL_TABLE_ENGINE_STORAGE_KEY) return normalValue;
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

describe('heatCalc normal table engine', () => {
  it('uses Glide as the default normal-mode engine', () => {
    expect(resolveHeatCalcNormalTableEngine({ search: '', storage: storageWith(null) })).toBe('glide');
  });

  it('enables normal Glide grid from the query string', () => {
    expect(resolveHeatCalcNormalTableEngine({
      search: '?normalTableEngine=glide',
      storage: storageWith(null, 'table'),
    })).toBe('glide');
  });

  it('allows the AntD table fallback from the query string', () => {
    expect(resolveHeatCalcNormalTableEngine({
      search: '?normalTableEngine=table',
      storage: storageWith(null, 'glide'),
    })).toBe('table');
  });

  it('falls back to localStorage for the normal table engine', () => {
    expect(resolveHeatCalcNormalTableEngine({
      search: '?project=1',
      storage: storageWith(null, 'table'),
    })).toBe('table');
  });

  it('ignores unknown normal table engine values', () => {
    expect(resolveHeatCalcNormalTableEngine({
      search: '?normalTableEngine=canvas',
      storage: storageWith(null, 'unknown'),
    })).toBe('glide');
  });
});
