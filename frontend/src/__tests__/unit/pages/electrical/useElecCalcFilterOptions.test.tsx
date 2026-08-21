import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ElectricalCandidate } from '@/types/calculation';
import type { ObjectQueryFieldCapability } from '@/types/project';
import type { HeatCalcColumnValueAccessors } from '@/utils/heatCalcTableFindability';
import { useElecCalcFilterOptions } from '@/pages/electrical/useElecCalcFilterOptions';

function capability(
  key: string,
  dataType: ObjectQueryFieldCapability['data_type'],
  options: ObjectQueryFieldCapability['options'] = null,
): ObjectQueryFieldCapability {
  return {
    key,
    label: key,
    title: key,
    data_type: dataType,
    unit: null,
    filter: {
      enabled: true,
      ops: dataType === 'enum' ? ['in'] : ['contains'],
      include_empty: false,
    },
    sort: {
      enabled: true,
      type: dataType === 'number' ? 'number' : 'text',
    },
    options,
  };
}

describe('useElecCalcFilterOptions', () => {
  it('builds backend capabilities and main enum filter options', () => {
    const statusCapability = capability('electrical_status', 'enum', {
      mode: 'inline',
      include_empty: true,
      items: [
        { value: 'success', label: 'Успешно' },
        { value: 404, label: 'Ошибка 404' },
      ],
    });
    const totalPowerCapability = capability('total_power', 'number');
    const { result } = renderHook(() => useElecCalcFilterOptions({
      electricalFields: [statusCapability, totalPowerCapability],
      cableSizingCandidates: [],
      visibleCandidateColumnMetas: [],
      candidateColumnValueAccessors: {},
    }));

    expect(result.current.fieldCapabilityByKey.get('electrical_status')).toBe(statusCapability);
    expect(result.current.fieldCapabilityByKey.get('total_power')).toBe(totalPowerCapability);
    expect(result.current.enumOptionsByColumn).toEqual({
      electrical_status: [
        { value: 'success', label: 'Успешно' },
        { value: '404', label: 'Ошибка 404' },
      ],
    });
  });

  it('builds candidate enum options from visible columns and accessors', () => {
    const candidates = [
      { id: 'candidate-1', cable_type: 'tt', mode: 'manual' },
      { id: 'candidate-2', cable_type: 'selfreg', mode: 'auto' },
      { id: 'candidate-3', cable_type: 'tt', mode: '—' },
    ] as ElectricalCandidate[];
    const candidateColumnValueAccessors: HeatCalcColumnValueAccessors<ElectricalCandidate> = {
      cable_type: (candidate) => candidate.cable_type,
      mode: (candidate) => candidate.mode,
      cable_mark: (candidate) => candidate.cable_mark,
    };
    const { result } = renderHook(() => useElecCalcFilterOptions({
      electricalFields: null,
      cableSizingCandidates: candidates,
      visibleCandidateColumnMetas: [
        { key: 'cable_type' },
        { key: 'mode' },
        { key: 'cable_mark' },
      ],
      candidateColumnValueAccessors,
    }));

    expect(result.current.fieldCapabilityByKey.size).toBe(0);
    expect(result.current.enumOptionsByColumn).toEqual({});
    expect(result.current.candidateEnumOptionsByColumn).toEqual({
      cable_type: [
        { value: 'selfreg', label: 'selfreg' },
        { value: 'tt', label: 'tt' },
      ],
      mode: [
        { value: 'auto', label: 'auto' },
        { value: 'manual', label: 'manual' },
      ],
    });
  });
});
