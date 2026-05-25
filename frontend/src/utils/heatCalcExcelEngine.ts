export const HEATCALC_EXCEL_ENGINE_STORAGE_KEY = 'heatcalc.excelEngine';
export const HEATCALC_NORMAL_TABLE_ENGINE_STORAGE_KEY = 'heatcalc.normalTableEngine';

export type HeatCalcExcelEngine = 'table' | 'glide';
export type HeatCalcNormalTableEngine = 'table' | 'glide';
export const DEFAULT_HEATCALC_EXCEL_ENGINE: HeatCalcExcelEngine = 'glide';
export const DEFAULT_HEATCALC_NORMAL_TABLE_ENGINE: HeatCalcNormalTableEngine = 'glide';

function normalizeHeatCalcExcelEngine(value: string | null | undefined): HeatCalcExcelEngine | null {
  if (value === 'glide') return 'glide';
  if (value === 'table') return 'table';
  return null;
}

function normalizeHeatCalcNormalTableEngine(value: string | null | undefined): HeatCalcNormalTableEngine | null {
  if (value === 'glide') return 'glide';
  if (value === 'table') return 'table';
  return null;
}

export function resolveHeatCalcExcelEngine({
  search,
  storage,
}: {
  search?: string;
  storage?: Pick<Storage, 'getItem'> | null;
} = {}): HeatCalcExcelEngine {
  const resolvedSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const searchValue = new URLSearchParams(resolvedSearch).get('excelEngine');
  const searchEngine = normalizeHeatCalcExcelEngine(searchValue);
  if (searchEngine) return searchEngine;

  const storageValue = storage
    ? storage.getItem(HEATCALC_EXCEL_ENGINE_STORAGE_KEY)
    : typeof window !== 'undefined'
      ? window.localStorage.getItem(HEATCALC_EXCEL_ENGINE_STORAGE_KEY)
      : null;

  return normalizeHeatCalcExcelEngine(storageValue) ?? DEFAULT_HEATCALC_EXCEL_ENGINE;
}

export function resolveHeatCalcNormalTableEngine({
  search,
  storage,
}: {
  search?: string;
  storage?: Pick<Storage, 'getItem'> | null;
} = {}): HeatCalcNormalTableEngine {
  const resolvedSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const searchValue = new URLSearchParams(resolvedSearch).get('normalTableEngine');
  const searchEngine = normalizeHeatCalcNormalTableEngine(searchValue);
  if (searchEngine) return searchEngine;

  const storageValue = storage
    ? storage.getItem(HEATCALC_NORMAL_TABLE_ENGINE_STORAGE_KEY)
    : typeof window !== 'undefined'
      ? window.localStorage.getItem(HEATCALC_NORMAL_TABLE_ENGINE_STORAGE_KEY)
      : null;

  return normalizeHeatCalcNormalTableEngine(storageValue) ?? DEFAULT_HEATCALC_NORMAL_TABLE_ENGINE;
}
