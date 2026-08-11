import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  electricalCalcError,
  electricalCalcErrorCode,
  electricalCalcGuidanceContext,
  electricalCalcSuggestedActions,
  isElectricalCalcStale,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import {
  getElectricalErrorGuidance,
  type ElectricalErrorGuidance,
} from '@/utils/electricalErrorGuidance';
import { objectDisplayName } from '@/domain/electrical/elecCalcMainTableModel';
import { getHeatCalcFieldLabel } from '@/domain/heatCalcFieldRegistry';

export type ElectricalErrorSummaryItem = {
  stage: 'heat' | 'electrical';
  objectId: string;
  rowNumber: number;
  objectName: string;
  error: string;
  cableType: string | null;
  errorContext: Record<string, unknown> | null;
  errorCode: string | null;
  suggestedActions: string[] | null;
  fallback?: boolean;
};

function validationErrorCode(obj: ProjectObject): string | null {
  const value = obj.validation_errors?.error_code;
  return typeof value === 'string' && value.trim() ? value : null;
}

const BACKEND_HEAT_FIELD_ALIASES: Record<string, string> = {
  outer_diameter: 'outer_diameter_mm',
  wall_thickness: 'wall_thickness_mm',
  diameter: 'diameter_mm',
  height: 'height_mm',
  length: 'length_mm',
  width: 'width_mm',
  pipe_centerline_depth: 'burial_depth',
};

const BACKEND_HEAT_FIELD_LABELS: Record<string, string> = {
  insulation_layers: 'Теплоизоляция',
};

function backendHeatFieldLabel(field: string, obj: ProjectObject): string {
  if (BACKEND_HEAT_FIELD_LABELS[field]) return BACKEND_HEAT_FIELD_LABELS[field];
  const objectType = obj.object_type === 'pipe' || obj.object_type === 'tank'
    ? obj.object_type
    : undefined;
  return getHeatCalcFieldLabel(BACKEND_HEAT_FIELD_ALIASES[field] ?? field, {
    context: 'form',
    objectType,
    variant: 'full',
  });
}

function heatValidationErrorText(obj: ProjectObject): string {
  const errors = obj.validation_errors;
  if (!errors) return 'Исходные данные объекта не прошли проверку';
  const messages: string[] = [];
  if (typeof errors.message === 'string' && errors.message.trim()) {
    messages.push(errors.message.trim());
  }
  if (Array.isArray(errors.missing_fields)) {
    const labels = errors.missing_fields
      .filter((field): field is string => typeof field === 'string' && field.trim().length > 0)
      .map((field) => backendHeatFieldLabel(field, obj));
    if (labels.length > 0) messages.push(`Не заполнено: ${labels.join(', ')}`);
  }
  if (errors.fields && typeof errors.fields === 'object' && !Array.isArray(errors.fields)) {
    Object.entries(errors.fields as Record<string, unknown>).forEach(([field, message]) => {
      if (typeof message === 'string' && message.trim()) {
        messages.push(`${backendHeatFieldLabel(field, obj)}: ${message.trim()}`);
      }
    });
  }
  return messages.join('\n') || 'Исходные данные объекта не прошли проверку';
}

function heatValidationErrorItemForObject(
  obj: ProjectObject,
  index: number,
  electricalDisplayOffset: number,
): ElectricalErrorSummaryItem | null {
  if (obj.is_valid || obj.validation_errors?.category === 'unsupported') return null;
  return {
    stage: 'heat',
    objectId: obj.id,
    rowNumber: electricalDisplayOffset + index + 1,
    objectName: objectDisplayName(obj),
    error: heatValidationErrorText(obj),
    cableType: null,
    errorContext: obj.validation_errors,
    errorCode: validationErrorCode(obj),
    suggestedActions: null,
  };
}

export type ElectricalErrorItemsInput = {
  objects: ProjectObject[];
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  electricalDisplayOffset: number;
};

function electricalErrorItemForObject(
  obj: ProjectObject,
  index: number,
  calc: ElectricalCalcSummary | undefined,
  electricalDisplayOffset: number,
): ElectricalErrorSummaryItem | null {
  const heatValidationError = heatValidationErrorItemForObject(
    obj,
    index,
    electricalDisplayOffset,
  );
  if (heatValidationError) return heatValidationError;
  const error = electricalCalcError(calc);
  if (!error || isElectricalCalcUnsupported(calc) || isElectricalCalcStale(calc)) return null;
  return {
    stage: 'electrical',
    objectId: obj.id,
    rowNumber: electricalDisplayOffset + index + 1,
    objectName: objectDisplayName(obj),
    error,
    cableType: calc?.cable_type ?? null,
    errorContext: electricalCalcGuidanceContext(calc),
    errorCode: electricalCalcErrorCode(calc),
    suggestedActions: electricalCalcSuggestedActions(calc),
  };
}

export function buildElectricalErrorItems({
  objects,
  calcByObjectId,
  electricalDisplayOffset,
}: ElectricalErrorItemsInput): ElectricalErrorSummaryItem[] {
  return objects
    .map((obj, index) =>
      electricalErrorItemForObject(
        obj,
        index,
        calcByObjectId[obj.id],
        electricalDisplayOffset,
      )
    )
    .filter((item): item is ElectricalErrorSummaryItem => item != null);
}

export type ActiveElectricalErrorItemInput = ElectricalErrorItemsInput & {
  activeRowId: string | null;
  electricalErrorItems: ElectricalErrorSummaryItem[];
};

export function resolveActiveElectricalErrorItem({
  activeRowId,
  objects,
  calcByObjectId,
  electricalDisplayOffset,
  electricalErrorItems,
}: ActiveElectricalErrorItemInput): ElectricalErrorSummaryItem | null {
  if (activeRowId) {
    const activeIndex = objects.findIndex((obj) => obj.id === activeRowId);
    const activeObject = activeIndex >= 0 ? objects[activeIndex] : null;
    if (activeObject) {
      const item = electricalErrorItemForObject(
        activeObject,
        activeIndex,
        calcByObjectId[activeObject.id],
        electricalDisplayOffset,
      );
      if (item) return { ...item, fallback: false };
    }
  }
  const firstError = electricalErrorItems[0];
  return firstError ? { ...firstError, fallback: true } : null;
}

export function electricalErrorGuidanceForItem(
  item: ElectricalErrorSummaryItem | null | undefined,
): ElectricalErrorGuidance | null {
  if (!item?.error || item.stage === 'heat') return null;
  return getElectricalErrorGuidance({
    error: item.error,
    cableType: item.cableType,
    errorContext: item.errorContext,
    errorCode: item.errorCode,
    suggestedActions: item.suggestedActions,
  });
}
