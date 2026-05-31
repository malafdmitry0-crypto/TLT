import {
  CALCULATION_VARIANTS,
  type CalculationVariant,
} from '@/store/calculationVariantStore';

export function calculationVariantLabel(variants: readonly number[]) {
  return variants.map((targetVariant) => `СО${targetVariant}`).join(', ');
}

export function normalizeCalculationVariantList(values: readonly unknown[]): CalculationVariant[] {
  const selected = new Set(
    values
      .map(Number)
      .filter((value): value is CalculationVariant =>
        (CALCULATION_VARIANTS as readonly number[]).includes(value)),
  );
  return CALCULATION_VARIANTS.filter((targetVariant) => selected.has(targetVariant));
}
