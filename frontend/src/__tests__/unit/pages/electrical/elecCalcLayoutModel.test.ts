import { describe, expect, it } from 'vitest';

import {
  ELECTRICAL_LAYOUT_EDITABLE_COLUMNS,
  isElectricalLayoutCellEditable,
  maxThreadsForCableType,
  maxWindingCoefficientForDiameterMm,
  parseElectricalLayoutNumber,
  pipeOuterDiameterMm,
  validateElectricalLayoutCellCommit,
  windingCoefficientForPitch,
} from '@/pages/electrical/elecCalcLayoutModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {},
    results: {},
    is_valid: true,
    validation_errors: null,
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    variant_number: 1,
    params: {},
    results: { selected_cable: 'ТЛТ-25' },
    ...overrides,
  };
}

function editabilityOptions(
  overrides: Partial<Parameters<typeof isElectricalLayoutCellEditable>[0]> = {},
): Parameters<typeof isElectricalLayoutCellEditable>[0] {
  return {
    obj: projectObject(),
    columnKey: 'winding_pitch_mm',
    projectSelected: true,
    isCableMarkPending: false,
    calcByObjectId: { 'object-1': calc() },
    getCableTypeForObject: () => 'self_regulating',
    ...overrides,
  };
}

function commitOptions(
  overrides: Partial<Parameters<typeof validateElectricalLayoutCellCommit>[0]> = {},
): Parameters<typeof validateElectricalLayoutCellCommit>[0] {
  return {
    obj: projectObject({ params: { outer_diameter: 0.108 } }),
    columnKey: 'winding_pitch_mm',
    value: 500,
    projectSelected: true,
    calcByObjectId: {
      'object-1': calc({
        params: {},
        results: {
          selected_cable: 'ТЛТ-25',
          winding_pitch: 0,
          num_circuits: 2,
        },
      }),
    },
    getCableTypeForObject: () => 'self_regulating',
    ...overrides,
  };
}

describe('elecCalcLayoutModel', () => {
  it('keeps only layout columns editable', () => {
    expect(ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has('winding_pitch_mm')).toBe(true);
    expect(ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has('number_of_threads')).toBe(true);
    expect(ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has('cable_mark')).toBe(false);
  });

  it('allows layout editing only for editable columns with a valid project object and current cable mark', () => {
    expect(isElectricalLayoutCellEditable(editabilityOptions())).toBe(true);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      columnKey: 'cable_mark',
    }))).toBe(false);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      projectSelected: false,
    }))).toBe(false);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      obj: projectObject({ is_valid: false }),
    }))).toBe(false);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      isCableMarkPending: true,
    }))).toBe(false);
  });

  it('blocks layout editing without a current successful mark or for non-editable cable types', () => {
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      calcByObjectId: {},
    }))).toBe(false);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      calcByObjectId: { 'object-1': calc({ cable_mark: null, results: {} }) },
    }))).toBe(false);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      calcByObjectId: { 'object-1': calc({ results: { stale: true, selected_cable: 'ТЛТ-25' } }) },
    }))).toBe(false);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      getCableTypeForObject: () => 'mineral',
    }))).toBe(false);
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      getCableTypeForObject: () => 'skin',
    }))).toBe(false);
  });

  it('preserves existing behavior when saved cable type is absent', () => {
    expect(isElectricalLayoutCellEditable(editabilityOptions({
      getCableTypeForObject: () => null,
    }))).toBe(true);
  });

  it('validates layout commit prerequisites without mutating page state', () => {
    expect(validateElectricalLayoutCellCommit(commitOptions({
      columnKey: 'cable_mark',
    }))).toEqual({ status: 'ignored' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      projectSelected: false,
    }))).toEqual({ status: 'error', error: 'Проект не выбран' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      obj: projectObject({ is_valid: false }),
    }))).toEqual({ status: 'error', error: 'Теплопотери объекта не рассчитаны' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      calcByObjectId: {},
    }))).toEqual({ status: 'error', error: 'Сначала выполните электрорасчёт' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      getCableTypeForObject: () => 'mineral',
    }))).toEqual({
      status: 'error',
      error: 'Для этого типа кабеля параметры укладки не редактируются в таблице',
    });
  });

  it('validates winding pitch and preserves manual thread count when pitch changes', () => {
    expect(validateElectricalLayoutCellCommit(commitOptions({
      value: 'bad',
    }))).toEqual({ status: 'error', error: 'Введите число' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      value: -1,
    }))).toEqual({ status: 'error', error: 'Шаг навива не может быть отрицательным' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      value: 108,
    }))).toEqual({
      status: 'error',
      error: 'Шаг навива должен быть больше наружного диаметра трубы',
    });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      value: 300,
    }))).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Коэффициент навива'),
    });

    const result = validateElectricalLayoutCellCommit(commitOptions({
      value: 500,
      calcByObjectId: {
        'object-1': calc({
          results: {
            selected_cable: 'ТЛТ-25',
            winding_pitch: 120,
            num_circuits: 2.4,
            number_of_threads_source: 'manual',
          },
        }),
      },
    }));

    expect(result).toMatchObject({
      status: 'valid',
      mark: 'ТЛТ-25',
      cableType: 'self_regulating',
      windingPitchMm: 500,
      numberOfThreads: 2,
    });
  });

  it('validates thread count input and 1..3 cap for all types (E0)', () => {
    expect(validateElectricalLayoutCellCommit(commitOptions({
      columnKey: 'number_of_threads',
      value: 1.5,
    }))).toEqual({ status: 'error', error: 'Количество ниток должно быть целым числом' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      columnKey: 'number_of_threads',
      value: 0,
    }))).toEqual({ status: 'error', error: 'Количество ниток должно быть не меньше 1' });
    expect(validateElectricalLayoutCellCommit(commitOptions({
      columnKey: 'number_of_threads',
      value: 4,
      getCableTypeForObject: () => 'self_regulating',
    }))).toEqual({ status: 'error', error: 'Количество ниток должно быть не больше 3' });

    expect(validateElectricalLayoutCellCommit(commitOptions({
      columnKey: 'number_of_threads',
      value: 4,
      getCableTypeForObject: () => 'self_regulating_tt',
    }))).toEqual({ status: 'error', error: 'Количество ниток должно быть не больше 3' });

    expect(validateElectricalLayoutCellCommit(commitOptions({
      columnKey: 'number_of_threads',
      value: 4,
      getCableTypeForObject: () => 'single_core',
    }))).toEqual({ status: 'error', error: 'Количество ниток должно быть не больше 3' });

    expect(validateElectricalLayoutCellCommit(commitOptions({
      columnKey: 'number_of_threads',
      value: 3,
      getCableTypeForObject: () => 'self_regulating_tt',
    }))).toMatchObject({
      status: 'valid',
      windingPitchMm: 0,
      numberOfThreads: 3,
    });
  });

  it('parses localized numeric layout input strictly', () => {
    expect(parseElectricalLayoutNumber('12,5')).toBe(12.5);
    expect(parseElectricalLayoutNumber(' 12.5 ')).toBe(12.5);
    expect(parseElectricalLayoutNumber(3)).toBe(3);
    expect(parseElectricalLayoutNumber('')).toBeNull();
    expect(parseElectricalLayoutNumber('   ')).toBeNull();
    expect(parseElectricalLayoutNumber('12,5,7')).toBeNull();
    expect(parseElectricalLayoutNumber('abc')).toBeNull();
  });

  it('caps all cable types at 1..3 threads (DEC-06 / E0 MVP)', () => {
    expect(maxThreadsForCableType('self_regulating')).toBe(3);
    expect(maxThreadsForCableType('self_regulating_tt')).toBe(3);
    expect(maxThreadsForCableType('single_core')).toBe(3);
    expect(maxThreadsForCableType('three_core')).toBe(3);
    expect(maxThreadsForCableType('mineral')).toBe(3);
    expect(maxThreadsForCableType('skin')).toBe(3);
  });

  it('converts only positive pipe outer diameter from meters to millimeters', () => {
    expect(pipeOuterDiameterMm(projectObject({ params: { outer_diameter: 0.108 } }))).toBe(108);
    expect(pipeOuterDiameterMm(projectObject({ object_type: 'tank', params: { outer_diameter: 0.108 } }))).toBeNull();
    expect(pipeOuterDiameterMm(projectObject({ params: { outer_diameter: 0 } }))).toBeNull();
    expect(pipeOuterDiameterMm(projectObject({ params: { outer_diameter: 'bad' } }))).toBeNull();
  });

  it('matches the documented conservative winding coefficient boundaries', () => {
    expect(maxWindingCoefficientForDiameterMm(56.999)).toBe(1.0);
    expect(maxWindingCoefficientForDiameterMm(57)).toBe(1.1);
    expect(maxWindingCoefficientForDiameterMm(57.001)).toBe(1.2);
    expect(maxWindingCoefficientForDiameterMm(75)).toBe(1.2);
    expect(maxWindingCoefficientForDiameterMm(75.001)).toBe(1.3);
    expect(maxWindingCoefficientForDiameterMm(89)).toBe(1.3);
    expect(maxWindingCoefficientForDiameterMm(89.001)).toBe(1.4);
    expect(maxWindingCoefficientForDiameterMm(108)).toBe(1.4);
    expect(maxWindingCoefficientForDiameterMm(108.001)).toBe(1.5);
  });

  it('calculates winding coefficient from diameter and pitch', () => {
    const expected = Math.sqrt(1 + ((Math.PI * 108) / 60) ** 2);

    expect(windingCoefficientForPitch(108, 60)).toBeCloseTo(expected, 12);
  });
});
