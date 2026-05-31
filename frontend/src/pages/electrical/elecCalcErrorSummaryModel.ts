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
import { objectDisplayName } from '@/pages/electrical/elecCalcMainTableModel';

export type ElectricalErrorSummaryItem = {
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
  const error = electricalCalcError(calc);
  if (!error || isElectricalCalcUnsupported(calc) || isElectricalCalcStale(calc)) return null;
  return {
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
  if (!item?.error) return null;
  return getElectricalErrorGuidance({
    error: item.error,
    cableType: item.cableType,
    errorContext: item.errorContext,
    errorCode: item.errorCode,
    suggestedActions: item.suggestedActions,
  });
}
