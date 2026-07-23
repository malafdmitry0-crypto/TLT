/**
 * @module electrical/variant-selection-model
 * @owner electrical
 * Pure helpers for UUID-first ER selection / list cache reconciliation (VAR1).
 * Hook stays in useElectricalVariantSelection; commands stay in the hook until VAR2.
 */
import type { ApiError } from '@/api/client';
import { normalizeElectricalVariantId } from '@/store/calculationVariantStore';
import type { ElectricalVariant } from '@/types/electricalVariant';

export const ELECTRICAL_VARIANT_URL_PARAM = 'er';

export function routeElectricalVariantSignature(search: string): string {
  const params = new URLSearchParams(search);
  return params.has(ELECTRICAL_VARIANT_URL_PARAM)
    ? `er:${params.get(ELECTRICAL_VARIANT_URL_PARAM) ?? ''}`
    : 'er:none';
}

export function sortVariants(variants: readonly ElectricalVariant[]): ElectricalVariant[] {
  return [...variants].sort((left, right) => {
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    return left.id.localeCompare(right.id);
  });
}

export function normalizedVariantId(variant: ElectricalVariant): string | null {
  return normalizeElectricalVariantId(variant.id);
}

export function findVariant(
  variants: readonly ElectricalVariant[],
  variantId: unknown,
): ElectricalVariant | null {
  const normalizedId = normalizeElectricalVariantId(variantId);
  if (!normalizedId) return null;
  return variants.find((variant) => normalizedVariantId(variant) === normalizedId) ?? null;
}

export function mergeVariant(
  variants: readonly ElectricalVariant[] | undefined,
  nextVariant: ElectricalVariant,
): ElectricalVariant[] {
  const current = variants ?? [];
  const exists = current.some((variant) => variant.id === nextVariant.id);
  return sortVariants(
    exists
      ? current.map((variant) => (variant.id === nextVariant.id ? nextVariant : variant))
      : [...current, nextVariant],
  );
}

export function shouldReplayIdempotentIdentityMutation(error: unknown): boolean {
  if (!(error instanceof Error) || !('status' in error)) return false;
  const status = (error as ApiError).status;
  return status == null || status >= 500;
}
