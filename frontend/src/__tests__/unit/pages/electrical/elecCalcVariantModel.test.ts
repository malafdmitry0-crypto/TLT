import { describe, expect, it } from 'vitest';

import {
  electricalVariantNamesLabel,
  electricalVariantTargetOptions,
  legacyElectricalVariantTargetsForIds,
  LEGACY_ELECTRICAL_VARIANT_TARGET_REASON,
  normalizeElectricalVariantIdList,
} from '@/pages/electrical/elecCalcVariantModel';
import type { ElectricalVariant } from '@/types/electricalVariant';

const ER_1_ID = '11111111-1111-4111-8111-111111111111';
const ER_2_ID = '22222222-2222-4222-8222-222222222222';
const ER_5_ID = '55555555-5555-4555-8555-555555555555';

function electricalVariant(
  overrides: Partial<ElectricalVariant> & Pick<ElectricalVariant, 'id' | 'name'>,
): ElectricalVariant {
  return {
    project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sort_order: 0,
    is_active: false,
    copied_from_id: null,
    legacy_variant_number: null,
    specification_state: 'not_generated',
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
    ...overrides,
  };
}

const variants: ElectricalVariant[] = [
  electricalVariant({
    id: ER_5_ID,
    name: 'Резерв на зиму',
    sort_order: 50,
    legacy_variant_number: null,
  }),
  electricalVariant({
    id: ER_2_ID,
    name: 'Летний режим',
    sort_order: 20,
    legacy_variant_number: 2,
  }),
  electricalVariant({
    id: ER_1_ID,
    name: 'ЭР1',
    sort_order: 10,
    legacy_variant_number: 1,
  }),
];

describe('elecCalcVariantModel', () => {
  it('builds named UUID options in authoritative backend order', () => {
    expect(electricalVariantTargetOptions(variants)).toEqual([
      { label: 'ЭР1', value: ER_1_ID, disabled: false },
      { label: 'ЭР «Летний режим»', value: ER_2_ID, disabled: false },
      {
        label: `ЭР «Резерв на зиму» — недоступен: ${LEGACY_ELECTRICAL_VARIANT_TARGET_REASON}`,
        value: ER_5_ID,
        disabled: true,
      },
    ]);
  });

  it('normalizes only exact UUIDs present in the backend list without numeric inference', () => {
    expect(normalizeElectricalVariantIdList(
      [ER_5_ID, 1, '1', ER_2_ID, ER_2_ID, 'unknown-id'],
      variants,
    )).toEqual([ER_2_ID, ER_5_ID]);
    expect(normalizeElectricalVariantIdList([], variants)).toEqual([]);
  });

  it('keeps UUID, name and authoritative legacy adapter together for submission', () => {
    const targets = legacyElectricalVariantTargetsForIds(
      [ER_5_ID, ER_2_ID, ER_1_ID],
      variants,
    );
    expect(targets).toEqual([
      { id: ER_1_ID, name: 'ЭР1', legacyVariantNumber: 1 },
      { id: ER_2_ID, name: 'Летний режим', legacyVariantNumber: 2 },
    ]);
    expect(electricalVariantNamesLabel(targets)).toBe('ЭР1, Летний режим');
    expect(legacyElectricalVariantTargetsForIds(
      ['ЭР1', 'Летний режим'],
      variants,
    )).toEqual([]);
  });
});
