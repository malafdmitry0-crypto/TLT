import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  calcLayoutValues,
  currentElectricalCalc,
  getCableMark,
  getThreadSource,
} from '@/domain/electrical/elecCalcResultValueModel';

export type ElectricalLayoutCableType =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core'
  | 'mineral'
  | 'skin';

export const ELECTRICAL_LAYOUT_EDITABLE_COLUMNS = new Set(['winding_pitch_mm', 'number_of_threads']);

export type ElectricalLayoutCellEditabilityOptions = {
  obj: ProjectObject;
  columnKey: string;
  projectSelected: boolean;
  isCableMarkPending: boolean;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  getCableTypeForObject: (objectId: string) => string | null | undefined;
};

export function isElectricalLayoutCellEditable({
  obj,
  columnKey,
  projectSelected,
  isCableMarkPending,
  calcByObjectId,
  getCableTypeForObject,
}: ElectricalLayoutCellEditabilityOptions) {
  if (!ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has(columnKey)) return false;
  if (!projectSelected || !obj.is_valid || isCableMarkPending) return false;
  const calc = currentElectricalCalc(calcByObjectId[obj.id]);
  if (!calc || !getCableMark(calc)) return false;
  const cableType = getCableTypeForObject(obj.id);
  return cableType !== 'mineral' && cableType !== 'skin';
}

export type ElectricalLayoutCellCommitValidationOptions = {
  obj: ProjectObject;
  columnKey: string;
  value: unknown;
  projectSelected: boolean;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  getCableTypeForObject: (objectId: string) => ElectricalLayoutCableType;
};

export type ElectricalLayoutCellCommitValidationResult =
  | { status: 'ignored' }
  | { status: 'error'; error: string }
  | {
      status: 'valid';
      calc: ElectricalCalcSummary;
      mark: string;
      cableType: ElectricalLayoutCableType;
      windingPitchMm: number;
      numberOfThreads: number | null;
    };

export function validateElectricalLayoutCellCommit({
  obj,
  columnKey,
  value,
  projectSelected,
  calcByObjectId,
  getCableTypeForObject,
}: ElectricalLayoutCellCommitValidationOptions): ElectricalLayoutCellCommitValidationResult {
  if (!ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has(columnKey)) return { status: 'ignored' };
  if (!projectSelected) return { status: 'error', error: 'Проект не выбран' };
  if (!obj.is_valid) return { status: 'error', error: 'Теплопотери объекта не рассчитаны' };
  const calc = currentElectricalCalc(calcByObjectId[obj.id]);
  const mark = getCableMark(calc);
  if (!calc || !mark) return { status: 'error', error: 'Сначала выполните электрорасчёт' };

  const cableType = getCableTypeForObject(obj.id);
  if (cableType === 'mineral' || cableType === 'skin') {
    return {
      status: 'error',
      error: 'Для этого типа кабеля параметры укладки не редактируются в таблице',
    };
  }

  const parsed = parseElectricalLayoutNumber(value);
  if (parsed === null) return { status: 'error', error: 'Введите число' };
  const layoutValues = calcLayoutValues(calc);
  let windingPitchMm = layoutValues.windingPitchMm;
  let numberOfThreads: number | null = null;

  if (columnKey === 'winding_pitch_mm') {
    if (parsed < 0) {
      return { status: 'error', error: 'Шаг навива не может быть отрицательным' };
    }
    const diameterMm = pipeOuterDiameterMm(obj);
    if (diameterMm !== null && parsed > 0 && parsed <= diameterMm) {
      return { status: 'error', error: 'Шаг навива должен быть больше наружного диаметра трубы' };
    }
    if (diameterMm !== null && parsed > 0) {
      const coefficient = windingCoefficientForPitch(diameterMm, parsed);
      const maxCoefficient = maxWindingCoefficientForDiameterMm(diameterMm);
      if (coefficient > maxCoefficient + 1e-9) {
        return {
          status: 'error',
          error: `Коэффициент навива ${coefficient.toFixed(3)} превышает максимум ${maxCoefficient.toFixed(1)} для D=${diameterMm.toFixed(0)} мм`,
        };
      }
    }
    windingPitchMm = parsed;
    const threadSource = getThreadSource(calc);
    if (threadSource === 'manual' || threadSource === 'previous_result') {
      numberOfThreads = Math.round(layoutValues.numberOfThreads);
    }
  } else if (columnKey === 'number_of_threads') {
    const integerValue = Math.round(parsed);
    if (integerValue !== parsed) {
      return { status: 'error', error: 'Количество ниток должно быть целым числом' };
    }
    if (integerValue < 1) {
      return { status: 'error', error: 'Количество ниток должно быть не меньше 1' };
    }
    const maxThreads = maxThreadsForCableType(cableType);
    if (integerValue > maxThreads) {
      return { status: 'error', error: `Количество ниток должно быть не больше ${maxThreads}` };
    }
    numberOfThreads = integerValue;
  }

  return {
    status: 'valid',
    calc,
    mark,
    cableType,
    windingPitchMm,
    numberOfThreads,
  };
}

export function parseElectricalLayoutNumber(value: unknown) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function maxThreadsForCableType(type: ElectricalLayoutCableType) {
  return type === 'self_regulating' ? 3 : 100;
}

export function pipeOuterDiameterMm(obj: ProjectObject) {
  if (obj.object_type !== 'pipe') return null;
  const raw = Number(obj.params?.outer_diameter);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : null;
}

export function maxWindingCoefficientForDiameterMm(diameterMm: number) {
  if (diameterMm < 57) return 1.0;
  if (diameterMm === 57) return 1.1;
  if (diameterMm <= 75) return 1.2;
  if (diameterMm <= 89) return 1.3;
  if (diameterMm <= 108) return 1.4;
  return 1.5;
}

export function windingCoefficientForPitch(diameterMm: number, pitchMm: number) {
  return Math.sqrt(1 + ((Math.PI * diameterMm) / pitchMm) ** 2);
}
