/* eslint-disable @typescript-eslint/no-unused-vars -- mock harness */
/**
 * Shared harness for ElectricalVariantTabs scenario tests.
 */
import { vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ElectricalVariantTabs from '@/pages/electrical/ElectricalVariantTabs';
import type { ElectricalVariantSelectionController } from '@/hooks/useElectricalVariantSelection';
import type { ElectricalReadinessResponse, ElectricalVariant } from '@/types/electricalVariant';

export function tabsTree(
  ctrl: ElectricalVariantSelectionController,
  canMutate = true,
) {
  return (
    <MemoryRouter>
      <ElectricalVariantTabs controller={ctrl} canMutate={canMutate} />
    </MemoryRouter>
  );
}

export function renderTabs(
  ctrl: ElectricalVariantSelectionController,
  canMutate = true,
) {
  return render(tabsTree(ctrl, canMutate));
}

export const PROJECT_ID = 'project-a';
export const ER_1_ID = '11111111-1111-4111-8111-111111111111';
export const ER_2_ID = '22222222-2222-4222-8222-222222222222';

export function variant(
  id: string,
  name: string,
  sortOrder: number,
  isActive = false,
): ElectricalVariant {
  return {
    id,
    project_id: PROJECT_ID,
    name,
    sort_order: sortOrder,
    is_active: isActive,
    copied_from_id: null,
    legacy_variant_number: sortOrder + 1,
    specification_state: 'not_generated',
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
  };
}

export const ER_1 = variant(ER_1_ID, 'Рабочее решение', 0, true);
export const ER_2 = variant(ER_2_ID, 'Альтернатива Ω очень длинное имя', 1);

export function controller(
  overrides: Partial<ElectricalVariantSelectionController> = {},
): ElectricalVariantSelectionController {
  const variants = overrides.variants ?? [ER_1, ER_2];
  const selectedVariant = overrides.selectedVariant === undefined ? ER_2 : overrides.selectedVariant;
  return {
    projectId: PROJECT_ID,
    variants,
    selectedVariantId: selectedVariant?.id ?? null,
    selectedVariant,
    activeVariant: variants.find((item) => item.is_active) ?? null,
    isLoading: false,
    isFetching: false,
    isError: false,
    listError: null,
    isEmpty: variants.length === 0,
    readiness: null,
    isReadinessLoading: false,
    isReadinessFetching: false,
    readinessError: null,
    mutationError: null,
    isMutating: false,
    pendingOperation: null,
    selectVariant: vi.fn(),
    selectAndActivateVariant: vi.fn().mockResolvedValue(ER_2),
    retryList: vi.fn().mockResolvedValue(undefined),
    retryReadiness: vi.fn().mockResolvedValue(undefined),
    initializeVariant: vi.fn().mockResolvedValue(ER_1),
    createVariant: vi.fn().mockResolvedValue(ER_2),
    copySelectedVariant: vi.fn().mockResolvedValue(ER_2),
    renameVariant: vi.fn().mockResolvedValue(ER_2),
    activateVariant: vi.fn().mockResolvedValue(ER_2),
    deleteVariant: vi.fn().mockResolvedValue(undefined),
    clearMutationError: vi.fn(),
    ...overrides,
  };
}

