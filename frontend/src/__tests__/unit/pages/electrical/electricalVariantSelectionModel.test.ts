import { describe, expect, it } from 'vitest';
import {
  findVariant,
  mergeVariant,
  routeElectricalVariantSignature,
  sortVariants,
} from '@/domain/electricalVariantSelectionModel';
import type { ElectricalVariant } from '@/types/electricalVariant';

function variant(id: string, sort_order: number): ElectricalVariant {
  return {
    id,
    project_id: 'p',
    name: id,
    sort_order,
    is_active: false,
    legacy_variant_number: sort_order,
    copied_from_id: null,
    specification_state: 'not_generated',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('electricalVariantSelectionModel (VAR1)', () => {
  it('builds route signature from er query param', () => {
    expect(routeElectricalVariantSignature('?er=abc')).toBe('er:abc');
    expect(routeElectricalVariantSignature('')).toBe('er:none');
  });

  it('sorts and merges variants by sort_order then id', () => {
    const a = variant('a', 2);
    const b = variant('b', 1);
    expect(sortVariants([a, b]).map((v) => v.id)).toEqual(['b', 'a']);
    const next = { ...a, name: 'renamed' };
    expect(mergeVariant([a, b], next).find((v) => v.id === 'a')?.name).toBe('renamed');
  });

  it('finds by normalized id', () => {
    const list = [variant('11111111-1111-4111-8111-111111111111', 1)];
    expect(findVariant(list, list[0].id)?.id).toBe(list[0].id);
    expect(findVariant(list, 'missing')).toBeNull();
  });
});
