/**
 * Pure helpers for useSpecificationPageModel (P-BAND-22).
 */

export function buildSpecificationGeneratedToast(args: {
  partial: boolean;
  generatedCount: number;
  electricalVariantName: string;
}): string {
  const { partial, generatedCount, electricalVariantName } = args;
  if (partial) {
    return generatedCount > 1
      ? `Сформирована неполная спецификация для ${generatedCount} ЭР — не использовать как полный закупочный комплект`
      : `Сформирована неполная спецификация для «${electricalVariantName}» — не использовать как полный закупочный комплект`;
  }
  return generatedCount > 1
    ? `Спецификация сформирована для ${generatedCount} ЭР`
    : `Спецификация для «${electricalVariantName}» сформирована`;
}

export function buildExcludedGroupsToast(
  excludedGroups: Array<{ error_code?: string | null }> | null | undefined,
): string | null {
  if (!excludedGroups?.length) return null;
  const codes = excludedGroups
    .map((g) => g.error_code)
    .filter(Boolean)
    .join(', ');
  return `Исключённые группы: ${codes || 'см. диагностику на экране'}`;
}

export function buildPreflightSummaryText(preflight: {
  total_skipped_objects?: number;
  variants?: Array<{
    electrical_variant_name?: string | null;
    skipped_objects?: number;
  }>;
} | null | undefined): string {
  const lines = (preflight?.variants ?? [])
    .filter((v) => (v.skipped_objects ?? 0) > 0)
    .map(
      (v) =>
        `«${v.electrical_variant_name || 'ЭР'}»: исключено объектов ${v.skipped_objects}`,
    );
  return [
    `Всего исключений: ${preflight?.total_skipped_objects ?? 0}.`,
    'После подтверждения partial generation выполнится атомарно (PDL-ER-36).',
    ...lines,
  ].join('\n');
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
  selectedHasLegacy: boolean,
): string[] {
  if (prev.length === 0) return selectedId ? [selectedId] : [];
  const stillValid = prev.filter((id) => availableIds.has(id));
  if (stillValid.length > 0) return stillValid;
  return selectedHasLegacy && selectedId ? [selectedId] : [];
}
