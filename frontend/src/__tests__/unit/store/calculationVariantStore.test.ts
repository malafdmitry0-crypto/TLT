import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeElectricalVariantId,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';

const projectA = 'project-a';
const projectB = 'project-b';
const variantA = '11111111-1111-4111-8111-111111111111';
const variantB = '22222222-2222-4222-8222-222222222222';

describe('calculationVariantStore UUID selection', () => {
  beforeEach(() => {
    localStorage.clear();
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
    localStorage.clear();
  });

  it('accepts canonical UUIDs, normalizes case, and rejects corrupted IDs', () => {
    expect(normalizeElectricalVariantId(variantA.toUpperCase())).toBe(variantA);
    expect(normalizeElectricalVariantId('')).toBeNull();
    expect(normalizeElectricalVariantId(` ${variantA}`)).toBeNull();
    expect(normalizeElectricalVariantId('not-a-uuid')).toBeNull();
    expect(normalizeElectricalVariantId(null)).toBeNull();
  });

  it('sets selections independently per project', () => {
    const { setSelectedVariantId } = useCalculationVariantStore.getState();

    setSelectedVariantId(projectA, variantA);
    setSelectedVariantId(projectB, variantB);

    expect(useCalculationVariantStore.getState().selectedVariantIdByProject).toEqual({
      [projectA]: variantA,
      [projectB]: variantB,
    });
  });

  it('clears only the requested project selection', () => {
    const { setSelectedVariantId, clearSelectedVariantId } =
      useCalculationVariantStore.getState();
    setSelectedVariantId(projectA, variantA);
    setSelectedVariantId(projectB, variantB);

    clearSelectedVariantId(projectA);

    expect(useCalculationVariantStore.getState().selectedVariantIdByProject).toEqual({
      [projectB]: variantB,
    });
  });

  it('drops an existing selection when a setter receives an invalid UUID', () => {
    const { setSelectedVariantId } = useCalculationVariantStore.getState();
    setSelectedVariantId(projectA, variantA);

    setSelectedVariantId(projectA, 'invalid');

    expect(useCalculationVariantStore.getState().selectedVariantIdByProject).toEqual({});
  });

  it('migrates numeric-only v1 state to an empty UUID selection', async () => {
    const migrate = useCalculationVariantStore.persist.getOptions().migrate!;

    const migrated = await migrate({ variantByProject: { [projectA]: 3 } }, 1);

    expect(migrated).toEqual({ selectedVariantIdByProject: {} });
    expect(migrated).not.toHaveProperty('variantByProject');
  });

  it('keeps only valid project UUID selections while migrating persisted data', async () => {
    const migrate = useCalculationVariantStore.persist.getOptions().migrate!;

    const migrated = await migrate(
      {
        selectedVariantIdByProject: {
          [projectA]: variantA.toUpperCase(),
          [projectB]: 'corrupted',
          '': variantB,
        },
        variantByProject: { [projectA]: 2 },
      },
      1,
    );

    expect(migrated).toEqual({
      selectedVariantIdByProject: { [projectA]: variantA },
    });
  });

  it('persists only selected UUIDs and excludes the legacy numeric map in v2', () => {
    const { setSelectedVariantId, setVariant } = useCalculationVariantStore.getState();
    setSelectedVariantId(projectA, variantA);
    setVariant(projectA, 4);

    const partialize = useCalculationVariantStore.persist.getOptions().partialize!;
    const persisted = partialize(useCalculationVariantStore.getState());

    expect(persisted).toEqual({
      selectedVariantIdByProject: { [projectA]: variantA },
    });
    expect(persisted).not.toHaveProperty('variantByProject');
    expect(useCalculationVariantStore.getState().variantByProject).toEqual({
      [projectA]: 4,
    });
  });

  it('clears the runtime compatibility slot without changing UUID selection', () => {
    const { setSelectedVariantId, setVariant, clearVariant } =
      useCalculationVariantStore.getState();
    setSelectedVariantId(projectA, variantA);
    setVariant(projectA, 3);

    clearVariant(projectA);

    expect(useCalculationVariantStore.getState().variantByProject).toEqual({});
    expect(useCalculationVariantStore.getState().selectedVariantIdByProject).toEqual({
      [projectA]: variantA,
    });
  });

  it('sanitizes v2 hydration and never restores a numeric selection', () => {
    const merge = useCalculationVariantStore.persist.getOptions().merge!;
    const current = {
      ...useCalculationVariantStore.getState(),
      variantByProject: { [projectA]: 2 as const },
    };

    const merged = merge(
      {
        selectedVariantIdByProject: {
          [projectA]: variantA,
          [projectB]: 'bad',
        },
        variantByProject: { [projectA]: 4 },
      },
      current,
    );

    expect(merged.selectedVariantIdByProject).toEqual({ [projectA]: variantA });
    expect(merged.variantByProject).toEqual({});
  });
});
