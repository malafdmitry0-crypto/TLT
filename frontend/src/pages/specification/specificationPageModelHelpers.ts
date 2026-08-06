/**
 * Pure helpers for useSpecificationPageModel (P-BAND-22).
 */
import { ELECTRICAL_VARIANT_URL_PARAM } from '@/domain/electricalVariantRouteModel';
import { ROUTES } from '@/routes/routes';

export type SpecificationMutationScope = {
  projectId: string;
  electricalVariantId: string;
  electricalVariantName: string;
  queryKey: readonly unknown[];
};

export function buildSpecificationMutationScope(
  project: { id: string } | null | undefined,
  variant: { id: string; name: string } | null | undefined,
): SpecificationMutationScope {
  if (!project || !variant?.id) {
    throw new Error('Выбранный ЭР недоступен для спецификации');
  }
  return {
    projectId: project.id,
    electricalVariantId: variant.id,
    electricalVariantName: variant.name,
    queryKey: ['spec', project.id, variant.id],
  };
}

export function buildFixUnassignedNavigation(electricalVariantId?: string | null) {
  const search = electricalVariantId
    ? `?${ELECTRICAL_VARIANT_URL_PARAM}=${encodeURIComponent(electricalVariantId)}`
    : '';
  return {
    to: { pathname: ROUTES.elecCalc, search },
    state: {
      systemView: 'unassigned' as const,
      ...(electricalVariantId ? { electricalVariantId } : {}),
    },
  };
}

export function buildElectricalVariantNavigation(electricalVariantId?: string | null) {
  const search = electricalVariantId
    ? `?${ELECTRICAL_VARIANT_URL_PARAM}=${encodeURIComponent(electricalVariantId)}`
    : '';
  return {
    to: { pathname: ROUTES.elecCalc, search },
    state: electricalVariantId ? { electricalVariantId } : undefined,
  };
}

export function buildSpecificationGeneratedToast(args: {
  hasUnresolved: boolean;
  generatedCount: number;
  electricalVariantName: string;
}): string {
  const { hasUnresolved, generatedCount, electricalVariantName } = args;
  if (hasUnresolved) {
    return generatedCount > 0
      ? `Спецификация сформирована для ${generatedCount} ЭР; остальные выбранные ЭР требуют действий`
      : 'Выбранные ЭР требуют действий до формирования';
  }
  return generatedCount > 1
    ? `Спецификация сформирована для ${generatedCount} ЭР`
    : `Спецификация для «${electricalVariantName}» сформирована`;
}

export function resolveGenerateVariantIds(
  selectedGenerateErIds: string[],
  fallbackElectricalVariantId: string,
): string[] {
  return selectedGenerateErIds.length > 0
    ? selectedGenerateErIds
    : [fallbackElectricalVariantId];
}

export function filterValidGenerateErIds(
  prev: string[],
  availableIds: Set<string>,
  selectedId: string | undefined,
): string[] {
  if (prev.length === 0) return selectedId ? [selectedId] : [];
  const stillValid = prev.filter((id) => availableIds.has(id));
  if (stillValid.length > 0) return stillValid;
  return selectedId && availableIds.has(selectedId) ? [selectedId] : [];
}
