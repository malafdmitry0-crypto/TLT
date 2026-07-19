import {
  CALCULATION_VARIANTS,
  type CalculationVariant,
} from '@/store/calculationVariantStore';
import type { ElectricalVariant } from '@/types/electricalVariant';

export const LEGACY_ELECTRICAL_VARIANT_TARGET_REASON =
  'перенос марки ещё не поддерживает этот ЭР';

export type ElectricalVariantTargetOption = {
  label: string;
  value: string;
  disabled: boolean;
};

export type LegacyElectricalVariantTarget = {
  id: string;
  name: string;
  legacyVariantNumber: CalculationVariant;
};

export function electricalVariantNamesLabel(
  variants: readonly LegacyElectricalVariantTarget[],
): string {
  return variants.map((targetVariant) => targetVariant.name).join(', ');
}

function sortedElectricalVariants(
  electricalVariants: readonly ElectricalVariant[],
): ElectricalVariant[] {
  return [...electricalVariants].sort((left, right) =>
    left.sort_order - right.sort_order || left.id.localeCompare(right.id));
}

function calculationVariantFromLegacyNumber(value: number | null): CalculationVariant | null {
  return (CALCULATION_VARIANTS as readonly number[]).includes(value ?? Number.NaN)
    ? (value as CalculationVariant)
    : null;
}

function electricalVariantDisplayLabel(name: string): string {
  const trimmedName = name.trim();
  return /^ЭР(?:\s|\d|$)/iu.test(trimmedName)
    ? trimmedName
    : `ЭР «${trimmedName}»`;
}

export function electricalVariantTargetOptions(
  electricalVariants: readonly ElectricalVariant[],
): ElectricalVariantTargetOption[] {
  return sortedElectricalVariants(electricalVariants).map((electricalVariant) => {
    const displayLabel = electricalVariantDisplayLabel(electricalVariant.name);
    const disabled = calculationVariantFromLegacyNumber(
      electricalVariant.legacy_variant_number,
    ) == null;
    return {
      value: electricalVariant.id,
      disabled,
      label: disabled
        ? `${displayLabel} — недоступен: ${LEGACY_ELECTRICAL_VARIANT_TARGET_REASON}`
        : displayLabel,
    };
  });
}

export function normalizeElectricalVariantIdList(
  values: readonly unknown[],
  electricalVariants: readonly ElectricalVariant[],
): string[] {
  const selectedIds = new Set(
    values.filter((value): value is string => typeof value === 'string'),
  );
  return sortedElectricalVariants(electricalVariants)
    .filter((electricalVariant) => selectedIds.has(electricalVariant.id))
    .map((electricalVariant) => electricalVariant.id);
}

export function legacyElectricalVariantTargetsForIds(
  electricalVariantIds: readonly string[],
  electricalVariants: readonly ElectricalVariant[],
): LegacyElectricalVariantTarget[] {
  const selectedIds = new Set(electricalVariantIds);
  return sortedElectricalVariants(electricalVariants).flatMap((electricalVariant) => {
    if (!selectedIds.has(electricalVariant.id)) return [];
    const legacyVariantNumber = calculationVariantFromLegacyNumber(
      electricalVariant.legacy_variant_number,
    );
    if (legacyVariantNumber == null) return [];
    return [{
      id: electricalVariant.id,
      name: electricalVariant.name,
      legacyVariantNumber,
    }];
  });
}
