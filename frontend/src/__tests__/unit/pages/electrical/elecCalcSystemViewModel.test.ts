import { describe, expect, it } from 'vitest';

import {
  filterObjectsBySystemView,
  objectMatchesSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import type { ElectricalQueryAssignment } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function obj(id: string): ProjectObject {
  return {
    id,
    project_id: 'p',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: { name: id },
    results: {},
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

function asg(
  objectId: string,
  system: ElectricalQueryAssignment['system_type'],
  state: ElectricalQueryAssignment['assignment_state'] = system ? 'ready' : 'unassigned',
): ElectricalQueryAssignment {
  return {
    object_id: objectId,
    system_type: system,
    assignment_state: state,
    version: 3,
  };
}

describe('elecCalcSystemViewModel', () => {
  it('filters objects by shared system view', () => {
    const objects = [obj('a'), obj('b'), obj('c')];
    const map = new Map([
      ['a', asg('a', null)],
      ['b', asg('b', 'self_regulating')],
      ['c', asg('c', 'resistive')],
    ]);

    expect(filterObjectsBySystemView(objects, map, 'all').map((o) => o.id))
      .toEqual(['a', 'b', 'c']);
    expect(filterObjectsBySystemView(objects, map, 'unassigned').map((o) => o.id))
      .toEqual(['a']);
    expect(filterObjectsBySystemView(objects, map, 'self_regulating').map((o) => o.id))
      .toEqual(['b']);
    expect(filterObjectsBySystemView(objects, map, 'resistive').map((o) => o.id))
      .toEqual(['c']);
    expect(filterObjectsBySystemView(objects, map, 'skin')).toEqual([]);
  });

  it('treats missing assignment as unassigned', () => {
    const map = new Map<string, ElectricalQueryAssignment>();
    expect(objectMatchesSystemView('x', map, 'unassigned')).toBe(true);
    expect(objectMatchesSystemView('x', map, 'self_regulating')).toBe(false);
  });
});
