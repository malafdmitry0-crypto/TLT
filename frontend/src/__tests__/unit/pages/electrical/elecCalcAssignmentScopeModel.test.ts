import { describe, expect, it } from 'vitest';

import {
  compatibleAssignedObjectIds,
  electricalAssignmentAvailabilityReason,
  electricalAssignmentCompatibilityReason,
  electricalAssignmentProjectionMap,
  electricalSystemForCableType,
  preferredCableTypeForElectricalAssignment,
} from '@/pages/electrical/elecCalcAssignmentScopeModel';
import type { ElectricalQueryAssignment, ElectricalQueryResponse } from '@/types/calculation';

const assignment = (
  objectId: string,
  systemType: ElectricalQueryAssignment['system_type'],
  assignmentState: ElectricalQueryAssignment['assignment_state'],
  version = 1,
): ElectricalQueryAssignment => ({
  object_id: objectId,
  system_type: systemType,
  assignment_state: assignmentState,
  version,
});

describe('elecCalcAssignmentScopeModel', () => {
  it('нормализует legacy cable types в две поддержанные системы', () => {
    expect(electricalSystemForCableType('self_regulating')).toBe('self_regulating');
    expect(electricalSystemForCableType('self_regulating_tt')).toBe('self_regulating');
    expect(electricalSystemForCableType('single_core')).toBe('resistive');
    expect(electricalSystemForCableType('three_core')).toBe('resistive');
    expect(electricalSystemForCableType('skin')).toBeNull();
    expect(electricalSystemForCableType('mineral')).toBeNull();
  });

  it('оставляет в explicit selected payload только совместимые назначения', () => {
    const byObject = new Map([
      ['compatible', assignment('compatible', 'self_regulating', 'stale', 4)],
      ['unassigned', assignment('unassigned', null, 'unassigned', 2)],
      ['other-system', assignment('other-system', 'resistive', 'ready', 8)],
    ]);

    expect(compatibleAssignedObjectIds(
      ['compatible', 'unassigned', 'other-system', 'missing'],
      byObject,
      'self_regulating_tt',
    )).toEqual(['compatible']);
    expect(electricalAssignmentCompatibilityReason(
      byObject.get('other-system'),
      'self_regulating',
    )).toContain('Резистив');
    expect(electricalAssignmentCompatibilityReason(undefined, 'self_regulating')).toContain(
      'не загружено',
    );
  });

  it('открывает manual/candidate flow для свежего resistive assignment и выбирает безопасный тип', () => {
    const freshResistive = assignment('resistive-fresh', 'resistive', 'stale', 2);

    expect(electricalAssignmentAvailabilityReason(freshResistive)).toBeNull();
    expect(electricalAssignmentCompatibilityReason(
      freshResistive,
      'self_regulating',
    )).toContain('Резистив');
    expect(preferredCableTypeForElectricalAssignment(
      freshResistive,
      'self_regulating',
    )).toBe('single_core');
    expect(preferredCableTypeForElectricalAssignment(
      freshResistive,
      'three_core',
    )).toBe('three_core');
    expect(preferredCableTypeForElectricalAssignment(
      assignment('unsupported', 'skin', 'unsupported'),
      'self_regulating',
    )).toBeNull();
  });

  it('объединяет pagination projection по object_id без подстановки другого ЭР', () => {
    const pageOne = {
      assignments: [assignment('one', 'self_regulating', 'ready', 1)],
    } as Pick<ElectricalQueryResponse, 'assignments'>;
    const pageTwo = {
      assignments: [assignment('two', 'resistive', 'error', 7)],
    } as Pick<ElectricalQueryResponse, 'assignments'>;

    const projection = electricalAssignmentProjectionMap([pageOne, pageTwo]);
    expect([...projection.keys()]).toEqual(['one', 'two']);
    expect(projection.get('two')?.version).toBe(7);
    expect(projection.has('foreign-er-object')).toBe(false);
  });
});
