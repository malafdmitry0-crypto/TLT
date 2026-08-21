/**
 * Characterization for workspace session controller surface.
 * Locks: systemView starts unassigned; UUID identity + legacy adapter;
 * auth/commercial/boot composition; focus ref.
 */
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import type { ElectricalVariant } from '@/types/electricalVariant';

const {
  stableBoot,
  focusableSpy,
  projectState,
  authState,
  commercialFlag,
} = vi.hoisted(() => {
  const stableBoot = {
    availableCableTypeKeys: ['self_regulating_tt'] as const,
    availableCableTypes: new Set(['self_regulating_tt']),
    electricalTableEngine: 'glide' as const,
    electricalGlideEnabled: true,
    navigationActiveJobId: null as string | null,
  };
  const focusableSpy = vi.fn();
  const projectState = {
    currentProject: { id: 'project-1', name: 'Demo' },
  };
  const authState = {
    role: 'employee' as string | null,
    user: { id: 'user-1' } as { id: string } | null,
  };
  const commercialFlag = { enabled: true };
  return {
    stableBoot,
    focusableSpy,
    projectState,
    authState,
    commercialFlag,
  };
});

vi.mock('@/pages/electrical/useElecCalcBootViewState', () => ({
  useElecCalcBootViewState: () => stableBoot,
}));

vi.mock('@/hooks/useFocusableTableScrollRegions', () => ({
  useFocusableTableScrollRegions: (
    ...args: Parameters<typeof import('@/hooks/useFocusableTableScrollRegions').useFocusableTableScrollRegions>
  ) => {
    focusableSpy(...args);
  },
}));

vi.mock('@/store/projectStore', () => ({
  useProjectStore: (selector: (s: typeof projectState) => unknown) => selector(projectState),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

vi.mock('@/config/featureFlags', () => ({
  areCommercialFeaturesEnabled: () => commercialFlag.enabled,
}));

import {
  useElecCalcWorkspaceSessionController,
} from '@/pages/electrical/useElecCalcWorkspaceSessionController';

const SESSION_CONTROLLER_RETURN_KEYS = [
  'project',
  'registeredUserId',
  'isEmployee',
  'isRegisteredUser',
  'commercialFeaturesAvailable',
  'navigate',
  'systemView',
  'setSystemView',
  'tableDragging',
  'setTableDragging',
  'availableCableTypeKeys',
  'availableCableTypes',
  'electricalGlideEnabled',
  'variant',
  'electricalVariantId',
  'electricalVariantName',
  'tableScrollRegionsRef',
] as const;

function baseVariant(overrides: Partial<ElectricalVariant> = {}): ElectricalVariant {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    project_id: 'project-1',
    name: 'Вариант 1',
    sort_order: 0,
    is_active: true,
    copied_from_id: null,
    legacy_variant_number: 2,
    specification_state: 'not_generated',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <TestMemoryRouter initialEntries={['/workspace/electrical']}>{children}</TestMemoryRouter>;
}

describe('useElecCalcWorkspaceSessionController', () => {
  it('exposes a stable session controller return surface', () => {
    const { result } = renderHook(
      () => useElecCalcWorkspaceSessionController({ electricalVariant: baseVariant() }),
      { wrapper },
    );

    expect(Object.keys(result.current).sort()).toEqual(
      [...SESSION_CONTROLLER_RETURN_KEYS].sort(),
    );
  });

  it('starts systemView as unassigned and tableDragging as false', () => {
    const { result } = renderHook(
      () => useElecCalcWorkspaceSessionController({ electricalVariant: baseVariant() }),
      { wrapper },
    );

    expect(result.current.systemView).toBe('unassigned');
    expect(result.current.tableDragging).toBe(false);
    expect(typeof result.current.setSystemView).toBe('function');
    expect(typeof result.current.setTableDragging).toBe('function');
  });

  it('treats UUID as identity and legacy number as CalculationVariant adapter only', () => {
    const electricalVariant = baseVariant({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'ER UUID name',
      legacy_variant_number: 3,
    });
    const { result } = renderHook(
      () => useElecCalcWorkspaceSessionController({ electricalVariant }),
      { wrapper },
    );

    expect(result.current.electricalVariantId).toBe(electricalVariant.id);
    expect(result.current.electricalVariantName).toBe('ER UUID name');
    expect(result.current.variant).toBe(3);
  });

  it('derives employee/registered capabilities and commercial flag from auth + feature flags', () => {
    authState.role = 'employee';
    authState.user = { id: 'user-42' };
    commercialFlag.enabled = true;
    projectState.currentProject = { id: 'project-1', name: 'Demo' };

    const { result } = renderHook(
      () => useElecCalcWorkspaceSessionController({ electricalVariant: baseVariant() }),
      { wrapper },
    );

    expect(result.current.project).toBe(projectState.currentProject);
    expect(result.current.isEmployee).toBe(true);
    expect(result.current.isRegisteredUser).toBe(true);
    expect(result.current.registeredUserId).toBe('user-42');
    expect(result.current.commercialFeaturesAvailable).toBe(true);
    expect(result.current.availableCableTypeKeys).toBe(stableBoot.availableCableTypeKeys);
    expect(result.current.availableCableTypes).toBe(stableBoot.availableCableTypes);
    expect(result.current.electricalGlideEnabled).toBe(true);
  });

  it('wires focusable table scroll regions with project-gated enabled flag', () => {
    focusableSpy.mockClear();
    projectState.currentProject = { id: 'project-1', name: 'Demo' };

    const { result } = renderHook(
      () => useElecCalcWorkspaceSessionController({ electricalVariant: baseVariant() }),
      { wrapper },
    );

    expect(focusableSpy).toHaveBeenCalled();
    const [ref, label, enabled] = focusableSpy.mock.calls[0];
    expect(ref).toBe(result.current.tableScrollRegionsRef);
    expect(label).toBe('Таблица электротехнического расчёта');
    expect(enabled).toBe(true);
  });

  it('treats guest role as non-employee / non-registered with commercial off', () => {
    authState.role = 'guest';
    authState.user = null;
    commercialFlag.enabled = false;

    const { result } = renderHook(
      () => useElecCalcWorkspaceSessionController({ electricalVariant: baseVariant() }),
      { wrapper },
    );

    expect(result.current.isEmployee).toBe(false);
    expect(result.current.isRegisteredUser).toBe(false);
    expect(result.current.registeredUserId).toBeNull();
    expect(result.current.commercialFeaturesAvailable).toBe(false);
  });
});
