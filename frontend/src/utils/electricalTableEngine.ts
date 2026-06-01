export const ELECTRICAL_TABLE_ENGINE_STORAGE_KEY = 'electrical.tableEngine';

export type ElectricalTableEngine = 'table' | 'glide';

export const DEFAULT_ELECTRICAL_TABLE_ENGINE: ElectricalTableEngine = 'glide';

function normalizeElectricalTableEngine(value: unknown): ElectricalTableEngine | null {
  if (value === 'table') return 'table';
  if (value === 'glide') return 'glide';
  return null;
}

export function resolveElectricalTableEngine({
  search,
  storage,
}: {
  search?: string;
  storage?: Pick<Storage, 'getItem'> | null;
} = {}): ElectricalTableEngine {
  const resolvedSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const searchValue = new URLSearchParams(resolvedSearch).get('electricalTableEngine');
  const searchEngine = normalizeElectricalTableEngine(searchValue);
  if (searchEngine) return searchEngine;

  const resolvedStorage = storage === undefined
    ? typeof window !== 'undefined'
      ? window.localStorage
      : null
    : storage;
  const storageValue = resolvedStorage?.getItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY);
  return normalizeElectricalTableEngine(storageValue) ?? DEFAULT_ELECTRICAL_TABLE_ENGINE;
}
