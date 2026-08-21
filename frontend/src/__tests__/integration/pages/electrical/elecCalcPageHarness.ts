/**
 * AF9-TEST-HARNESS-01 — public Electrical integration harness entry.
 *
 * P2-ELEC-FEEDBACK-01 worker budget (elec-integration project):
 * maxWorkers=2, pool=forks, isolate=true, fileParallelism=true.
 * Reason: heavy per-file ElecCalcPage mounts; dual concurrent suite runs must
 * stay green without raising timeouts. Shared reset lives in
 * elecCalcPageTestEnv.tsx (`resetElecCalcIntegrationState`).
 */
export {
  mockProject,
  makeObject,
  makeElectricalPage,
  makeCalcTask,
} from './elecCalcPageFixtures';
export { renderPage } from './elecCalcPageRender';
export { openElectricalTableSettingsOtherTab } from './elecCalcPageHelpers';
