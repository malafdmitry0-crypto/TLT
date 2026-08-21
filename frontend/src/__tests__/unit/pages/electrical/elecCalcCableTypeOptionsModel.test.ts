import { describe, expect, it } from 'vitest';

import {
  buildCableSourceSelectOptions,
  buildCableTypeSelectOptions,
  filterCableTypeOptionsForAssignment,
} from '@/pages/electrical/elecCalcCableTypeOptionsModel';
import type { ElectricalQueryAssignment } from '@/types/calculation';

describe('elecCalcCableTypeOptionsModel', () => {
  it('builds labeled cable type options', () => {
    const options = buildCableTypeSelectOptions(['self_regulating', 'single_core']);
    expect(options).toEqual([
      { label: expect.any(String), value: 'self_regulating' },
      { label: expect.any(String), value: 'single_core' },
    ]);
    expect(options[0].label.length).toBeGreaterThan(0);
  });

  it('filters options by assignment system', () => {
    const all = buildCableTypeSelectOptions([
      'self_regulating',
      'self_regulating_tt',
      'single_core',
      'three_core',
    ]);
    const resistive = filterCableTypeOptionsForAssignment(all, {
      object_id: 'a',
      system_type: 'resistive',
      assignment_state: 'ready',
      version: 1,
    } as ElectricalQueryAssignment);
    expect(resistive.map((o) => o.value)).toEqual(['single_core', 'three_core']);

    expect(filterCableTypeOptionsForAssignment(all, undefined)).toEqual([]);
  });

  it('builds cable source options for guest vs employee', () => {
    expect(buildCableSourceSelectOptions(false)).toEqual([
      { label: 'Встроенная', value: 'builtin' },
    ]);
    expect(buildCableSourceSelectOptions(true).map((o) => o.value)).toEqual([
      'builtin',
      'extended',
      'all',
    ]);
  });
});
