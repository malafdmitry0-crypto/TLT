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

interface CalculationVariantState {
  variantByProject: Record<string, CalculationVariant>;
  setVariant: (projectId: string, variant: number) => void;
}

export const useCalculationVariantStore = create<CalculationVariantState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'tlt-active-calculation-variant',
      version: 1,
      // Прогоняем сохранённую карту projectId→variant через нормализацию,
      // чтобы устаревшие/битые значения не утекли в UI как валидные.
      migrate: (persisted) => {
        const state = persisted as Partial<CalculationVariantState> | undefined;
        const raw = state?.variantByProject;
        const variantByProject: Record<string, CalculationVariant> = {};
        if (raw && typeof raw === 'object') {
          for (const [projectId, variant] of Object.entries(raw)) {
            variantByProject[projectId] = normalizeCalculationVariant(variant);
          }
        }
        return { variantByProject };
      },
    }
  )
);
