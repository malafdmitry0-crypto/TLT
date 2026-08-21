import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const CALCULATION_VARIANTS = [1, 2, 3, 4] as const;
export type CalculationVariant = (typeof CALCULATION_VARIANTS)[number];

export function normalizeCalculationVariant(value: unknown): CalculationVariant {
  const numeric = Number(value);
  return (CALCULATION_VARIANTS as readonly number[]).includes(numeric)
    ? (numeric as CalculationVariant)
    : 1;
}

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeElectricalVariantId(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim() || !CANONICAL_UUID_PATTERN.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function normalizeSelectedVariantIds(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const selectedVariantIdByProject: Record<string, string> = {};
  for (const [projectId, variantId] of Object.entries(value)) {
    const normalized = normalizeElectricalVariantId(variantId);
    if (projectId && normalized) {
      selectedVariantIdByProject[projectId] = normalized;
    }
  }
  return selectedVariantIdByProject;
}

export interface CalculationVariantState {
  selectedVariantIdByProject: Record<string, string>;
  setSelectedVariantId: (projectId: string, variantId: string | null) => void;
  clearSelectedVariantId: (projectId: string) => void;

  // Compatibility state for untouched Phase 5 consumers. It is runtime-only
  // from persisted schema v2 onward and must not be used to infer a UUID.
  variantByProject: Record<string, CalculationVariant>;
  setVariant: (projectId: string, variant: number) => void;
  clearVariant: (projectId: string) => void;
}

interface PersistedCalculationVariantState {
  selectedVariantIdByProject: Record<string, string>;
}

export const useCalculationVariantStore = create<CalculationVariantState>()(
  persist<CalculationVariantState, [], [], PersistedCalculationVariantState>(
    (set) => ({
      selectedVariantIdByProject: {},
      setSelectedVariantId: (projectId, variantId) => {
        const normalized = normalizeElectricalVariantId(variantId);
        set((state) => {
          const selectedVariantIdByProject = { ...state.selectedVariantIdByProject };
          if (projectId && normalized) {
            selectedVariantIdByProject[projectId] = normalized;
          } else if (projectId) {
            delete selectedVariantIdByProject[projectId];
          }
          return { selectedVariantIdByProject };
        });
      },
      clearSelectedVariantId: (projectId) => {
        if (!projectId) return;
        set((state) => {
          const selectedVariantIdByProject = { ...state.selectedVariantIdByProject };
          delete selectedVariantIdByProject[projectId];
          return { selectedVariantIdByProject };
        });
      },
      variantByProject: {},
      setVariant: (projectId, variant) => {
        const normalized = normalizeCalculationVariant(variant);
        set((state) => ({
          variantByProject: {
            ...state.variantByProject,
            [projectId]: normalized,
          },
        }));
      },
      clearVariant: (projectId) => {
        if (!projectId) return;
        set((state) => {
          const variantByProject = { ...state.variantByProject };
          delete variantByProject[projectId];
          return { variantByProject };
        });
      },
    }),
    {
      name: 'tlt-active-calculation-variant',
      version: 2,
      partialize: (state) => ({
        selectedVariantIdByProject: normalizeSelectedVariantIds(
          state.selectedVariantIdByProject,
        ),
      }),
      // Numeric v1 selections cannot be inferred as UUIDs without the server
      // mapping, so migration deliberately discards variantByProject.
      migrate: (persisted) => {
        const state = persisted as Partial<PersistedCalculationVariantState> | undefined;
        return {
          selectedVariantIdByProject: normalizeSelectedVariantIds(
            state?.selectedVariantIdByProject,
          ),
        };
      },
      merge: (persisted, current) => {
        const state = persisted as Partial<PersistedCalculationVariantState> | undefined;
        return {
          ...current,
          selectedVariantIdByProject: normalizeSelectedVariantIds(
            state?.selectedVariantIdByProject,
          ),
          variantByProject: {},
        };
      },
    }
  )
);
