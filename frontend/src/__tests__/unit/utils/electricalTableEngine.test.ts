import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ELECTRICAL_TABLE_ENGINE,
  ELECTRICAL_TABLE_ENGINE_STORAGE_KEY,
  resolveElectricalTableEngine,
} from '@/utils/electricalTableEngine';

function storageWith(value: string | null): Pick<Storage, 'getItem'> {
  return {
    getItem: (key) => {
      if (key === ELECTRICAL_TABLE_ENGINE_STORAGE_KEY) return value;
      return null;
    },
  };
}

describe('electricalTableEngine', () => {
  it('uses Glide as the default electrical table engine', () => {
    expect(resolveElectricalTableEngine({ search: '', storage: storageWith(null) }))
      .toBe(DEFAULT_ELECTRICAL_TABLE_ENGINE);
    expect(resolveElectricalTableEngine({ search: '', storage: storageWith(null) })).toBe('glide');
  });

  it('allows AntD table fallback through query string before storage', () => {
    expect(resolveElectricalTableEngine({
      search: '?electricalTableEngine=table',
      storage: storageWith('glide'),
    })).toBe('table');
  });

  it('allows localStorage fallback when no query override exists', () => {
    expect(resolveElectricalTableEngine({
      search: '',
      storage: storageWith('table'),
    })).toBe('table');
  });

  it('ignores invalid values', () => {
    expect(resolveElectricalTableEngine({
      search: '?electricalTableEngine=canvas',
      storage: storageWith('bad'),
    })).toBe('glide');
  });

});
