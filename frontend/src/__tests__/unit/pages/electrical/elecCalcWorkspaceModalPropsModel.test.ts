// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildElecCalcWorkspaceModalPresentation,
  buildElecCalcWorkspaceModalProps,
  resolveObjectActionDisabledReasonOrNull,
} from '@/pages/electrical/elecCalcWorkspaceModalPropsModel';
import { CABLE_SIZING_CANDIDATE_TABLE_MIN_SCROLL_X } from '@/pages/electrical/elecCalcCandidateTableScrollModel';

describe('resolveObjectActionDisabledReasonOrNull', () => {
  it('returns null when object is missing', () => {
    const getReason = vi.fn(() => 'blocked');
    expect(resolveObjectActionDisabledReasonOrNull(null, getReason)).toBeNull();
    expect(resolveObjectActionDisabledReasonOrNull(undefined, getReason)).toBeNull();
    expect(getReason).not.toHaveBeenCalled();
  });

  it('delegates to getter when object is present', () => {
    const object = { id: 'o1' };
    const getReason = vi.fn(() => 'no assignment');
    expect(resolveObjectActionDisabledReasonOrNull(object, getReason)).toBe('no assignment');
    expect(getReason).toHaveBeenCalledWith(object);
  });
});

describe('buildElecCalcWorkspaceModalPresentation', () => {
  it('resolves options, reasons, and candidate scroll width', () => {
    const getReason = (object: { id: string }) => (object.id === 'mark' ? 'mark-blocked' : null);
    const cableTypeOptionsForObject = (id: string | undefined) =>
      id === 'mark' ? [{ value: 'tlt' }] : [{ value: 'tt' }];

    const result = buildElecCalcWorkspaceModalPresentation({
      cableMarkModalObject: { id: 'mark' },
      cableSizingModalObject: { id: 'size' },
      cableTypeOptionsForObject,
      getObjectActionDisabledReason: getReason,
      visibleCandidateColumnMetas: [
        { width: 500, minWidthPx: 400 },
        { width: 500, minWidthPx: 400 },
      ],
    });

    expect(result.cableMarkModalCableTypeOptions).toEqual([{ value: 'tlt' }]);
    expect(result.cableSizingModalCableTypeOptions).toEqual([{ value: 'tt' }]);
    expect(result.cableMarkModalAssignmentReason).toBe('mark-blocked');
    expect(result.cableSizingModalAssignmentReason).toBeNull();
    expect(result.cableSizingCandidateTableScrollX).toBe(1000);
  });

  it('clamps candidate scroll to baseline minimum', () => {
    const result = buildElecCalcWorkspaceModalPresentation({
      cableMarkModalObject: null,
      cableSizingModalObject: null,
      cableTypeOptionsForObject: () => [],
      getObjectActionDisabledReason: () => null,
      visibleCandidateColumnMetas: [],
    });
    expect(result.cableSizingCandidateTableScrollX).toBe(
      CABLE_SIZING_CANDIDATE_TABLE_MIN_SCROLL_X,
    );
  });
});

describe('buildElecCalcWorkspaceModalProps', () => {
  it('returns the props bag for the view', () => {
    const bag = buildElecCalcWorkspaceModalProps({ canMutate: true, open: false });
    expect(bag).toEqual({ canMutate: true, open: false });
  });
});
