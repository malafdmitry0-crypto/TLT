import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ELECTRICAL_CANDIDATE_TABLE_ENGINE,
  DEFAULT_ELECTRICAL_TABLE_ENGINE,
  ELECTRICAL_CANDIDATE_TABLE_ENGINE_STORAGE_KEY,
  ELECTRICAL_TABLE_ENGINE_STORAGE_KEY,
  resolveElectricalCandidateTableEngine,
  resolveElectricalTableEngine,
} from '@/utils/electricalTableEngine';

function storageWith(value: string | null, candidateValue: string | null = null): Pick<Storage, 'getItem'> {
  return {
    getItem: (key) => {
      if (key === ELECTRICAL_TABLE_ENGINE_STORAGE_KEY) return value;
      if (key === ELECTRICAL_CANDIDATE_TABLE_ENGINE_STORAGE_KEY) return candidateValue;
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

  it('uses Glide as the default candidate table engine', () => {
    expect(resolveElectricalCandidateTableEngine({ search: '', storage: storageWith(null) }))
      .toBe(DEFAULT_ELECTRICAL_CANDIDATE_TABLE_ENGINE);
    expect(resolveElectricalCandidateTableEngine({ search: '', storage: storageWith(null) })).toBe('glide');
  });

  it('allows candidate table to fall back independently', () => {
    expect(resolveElectricalCandidateTableEngine({
      search: '?electricalCandidateTableEngine=table&electricalTableEngine=glide',
      storage: storageWith('glide'),
    })).toBe('table');
  });

  it('uses candidate table storage before main table fallback', () => {
    expect(resolveElectricalCandidateTableEngine({
      search: '?electricalTableEngine=glide',
      storage: storageWith('table', 'table'),
    })).toBe('table');
  });

  it('inherits the main Glide query when candidate table has no override', () => {
    expect(resolveElectricalCandidateTableEngine({
      search: '?electricalTableEngine=glide',
      storage: storageWith(null),
    })).toBe('glide');
  });

  it('inherits the main AntD table query when candidate table has no override', () => {
    expect(resolveElectricalCandidateTableEngine({
      search: '?electricalTableEngine=table',
      storage: storageWith(null),
    })).toBe('table');
  });
});
