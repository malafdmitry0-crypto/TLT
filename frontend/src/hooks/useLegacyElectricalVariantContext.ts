import { useEffect } from 'react';

import {
  CALCULATION_VARIANTS,
  useCalculationVariantStore,
  type CalculationVariant,
} from '@/store/calculationVariantStore';
import { useElectricalVariantSelection } from '@/pages/electrical/useElectricalVariantSelection';

function asCalculationVariant(value: number | null): CalculationVariant | null {
  return (CALCULATION_VARIANTS as readonly number[]).includes(value ?? Number.NaN)
    ? value as CalculationVariant
    : null;
}

/**
 * Safe number-only specification/report bridge during UUID cutover.
 * Selection, URL canonicalization and the authoritative-after-mount gate are
 * deliberately delegated to the same UUID-first controller as ElecCalcPage.
 */
export function useLegacyElectricalVariantContext(projectId: string | null | undefined) {
  const controller = useElectricalVariantSelection({ projectId });
  const setLegacyVariant = useCalculationVariantStore((state) => state.setVariant);
  const clearLegacyVariant = useCalculationVariantStore((state) => state.clearVariant);
  const legacyVariantNumber = asCalculationVariant(
    controller.selectedVariant?.legacy_variant_number ?? null,
  );

  useEffect(() => {
    if (!projectId || controller.isLoading || controller.isError) return;
    if (legacyVariantNumber == null) {
      clearLegacyVariant(projectId);
    } else {
      setLegacyVariant(projectId, legacyVariantNumber);
    }
  }, [
    clearLegacyVariant,
    controller.isError,
    controller.isLoading,
    legacyVariantNumber,
    projectId,
    setLegacyVariant,
  ]);

  return {
    variants: controller.variants,
    selectedVariant: controller.selectedVariant,
    legacyVariantNumber,
    selectVariant: controller.selectVariant,
    isLoading: controller.isLoading,
    isError: controller.isError,
    error: controller.listError,
    refetch: controller.retryList,
    isFetching: controller.isFetching,
  };
}

export default useLegacyElectricalVariantContext;
