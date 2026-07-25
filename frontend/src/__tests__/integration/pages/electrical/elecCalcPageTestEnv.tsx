/**
 * AF9-TEST-SPLIT-01 — shared vi.mock environment for Electrical integration.
 *
 * P2-ELEC-FEEDBACK-01 — worker budget (see vite.config.ts `elec-integration`):
 * - pool: forks, isolate: true, fileParallelism: true, maxWorkers: 2
 * - Each file boots full ElecCalcPage + AntD + heavy mocks in its own fork.
 * - Cap of 2 keeps dual concurrent suite runs (two DoDs / agent feedback loops)
 *   from thrashing the same workspace into timeout territory without serializing
 *   the whole suite to one worker (full Electrical would exceed 90s).
 * - Prefer resetElecCalcIntegrationState() over copy-pasted beforeEach bodies.
 *
 * Thin barrel: pure fixtures live in elecCalcPageFixtures; mock clusters in
 * elecCalcPageTestEnv.apiMocks / .componentMocks. 0 tests here.
 */
import { vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
// Named imports also register all vi.mock side-effects in these modules.
import {
  apiMocks,
  defaultElectricalVariantListImplementation,
  electricalVariantApiMocks,
} from './elecCalcPageTestEnv.apiMocks';
import {
  electricalAssignmentPanelMock,
  electricalGlideGridMock,
} from './elecCalcPageTestEnv.componentMocks';

/**
 * Shared per-test reset for Electrical integration owners.
 * Clears mocks/stores/localStorage and re-applies the default variant list impl
 * so each file does not re-declare the same expensive setup body.
 */
export function resetElecCalcIntegrationState(): void {
  vi.clearAllMocks();
  electricalVariantApiMocks.list.mockReset();
  if (defaultElectricalVariantListImplementation) {
    electricalVariantApiMocks.list.mockImplementation(
      defaultElectricalVariantListImplementation,
    );
  }
  electricalVariantApiMocks.readiness.mockReset();
  electricalVariantApiMocks.initialize.mockReset();
  electricalVariantApiMocks.create.mockReset();
  electricalVariantApiMocks.copy.mockReset();
  electricalVariantApiMocks.rename.mockReset();
  electricalVariantApiMocks.activate.mockReset();
  electricalVariantApiMocks.remove.mockReset();
  electricalVariantApiMocks.listAssignments.mockClear();
  electricalVariantApiMocks.assignObjects.mockReset();
  electricalVariantApiMocks.unassignObjects.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'true');
  electricalGlideGridMock.props = null;
  electricalAssignmentPanelMock.props = null;
  // Most scenarios exercise calculation behavior for already assigned
  // self-regulating objects. The real page starts on "unassigned", so the
  // harness explicitly performs the same tab change a user would.
  electricalAssignmentPanelMock.initialSystemView = 'self_regulating';
  localStorage.clear();
  // Main table uses AntD DOM here; candidate table is mocked through its Glide props.
  localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'table');
  useAuthStore.getState().logout();
  useAuthStore.getState().setGuest('sid');
  useProjectStore.getState().setCurrentProject(null);
  useCalculationVariantStore.setState({
    selectedVariantIdByProject: {},
    variantByProject: {},
  });
}

export {
  apiMocks,
  electricalVariantApiMocks,
  defaultElectricalVariantListImplementation,
  electricalGlideGridMock,
  electricalAssignmentPanelMock,
};
