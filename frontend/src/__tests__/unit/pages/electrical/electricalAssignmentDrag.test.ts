import { describe, expect, it } from 'vitest';

import { resolveElectricalAssignmentDragIds } from '@/pages/electrical/useElecCalcWorkspaceUiHelpers';

describe('resolveElectricalAssignmentDragIds', () => {
  it('drags the complete selection when the grabbed row is selected', () => {
    expect(resolveElectricalAssignmentDragIds('row-2', ['row-1', 'row-2'])).toEqual([
      'row-1',
      'row-2',
    ]);
  });

  it('drags only the grabbed row when it is outside the selection', () => {
    expect(resolveElectricalAssignmentDragIds('row-3', ['row-1', 'row-2'])).toEqual([
      'row-3',
    ]);
  });
});
