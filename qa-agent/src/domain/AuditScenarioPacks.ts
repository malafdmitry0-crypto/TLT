import type { ReportResult } from '../reporting/types';

export type AuditScenarioPack = {
  id: string;
  domain: 'business' | 'performance' | 'security' | 'ui' | 'metrics';
  title: string;
  objectCount?: number;
  steps: string[];
  expectedSignals: string[];
};

export const DEFAULT_SCENARIO_PACKS: AuditScenarioPack[] = [
  {
    id: 'small-project',
    domain: 'business',
    title: 'Small mixed project smoke',
    objectCount: 20,
    steps: ['Create mixed pipe/tank objects', 'Run heat-loss', 'Run selected electrical calculation'],
    expectedSignals: ['all valid heat-loss objects have results', 'electrical errors are actionable'],
  },
  {
    id: 'large-project-3000',
    domain: 'performance',
    title: 'Large project up to 3000 objects',
    objectCount: 3000,
    steps: ['Import/generate 3000 objects', 'Query first page', 'Run queued batch calculations'],
    expectedSignals: ['query meets budget', 'worker queue progresses', 'payload size remains bounded'],
  },
  {
    id: 'import-export-roundtrip',
    domain: 'business',
    title: 'Import/export roundtrip',
    steps: ['Import XLSX/CSV', 'Export project', 'Re-import exported file', 'Compare key params/results'],
    expectedSignals: ['no field loss', 'formula-like values are escaped', 'object count is stable'],
  },
  {
    id: 'guest-isolation',
    domain: 'security',
    title: 'Guest isolation',
    steps: ['Create two guest sessions', 'Create project in session A', 'Access from session B'],
    expectedSignals: ['cross-session access is denied', 'no foreign project data leaks'],
  },
  {
    id: 'electrical-manual-cables',
    domain: 'business',
    title: 'Manual and automatic cable selection',
    steps: ['Run auto selection', 'Set manual cable on selected row', 'Recalculate selected only'],
    expectedSignals: ['manual mark is preserved', 'mass recalculation respects selected scope'],
  },
  {
    id: 'report-generation',
    domain: 'business',
    title: 'Report generation consistency',
    steps: ['Run heat/electrical variants', 'Generate preview/export', 'Verify variant-specific data'],
    expectedSignals: ['report uses same variant for calculations and specification'],
  },
];

export function parseScenarioPackSelection(value: string | undefined): AuditScenarioPack[] {
  if (!value) return DEFAULT_SCENARIO_PACKS;
  const ids = new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const selected = DEFAULT_SCENARIO_PACKS.filter((pack) => ids.has(pack.id));
  return selected.length > 0 ? selected : DEFAULT_SCENARIO_PACKS;
}

export function scenarioPacksToReportResult(packs: AuditScenarioPack[]): ReportResult {
  return {
    testCase: {
      id: 'audit-scenario-packs',
      requirementId: 'audit_scenario_packs_defined',
      input: { packs: packs.map((pack) => pack.id) },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'Reusable audit scenario packs are available', warnings: [], metadata: {} },
    actual: { value: packs, status: 'success', warnings: [], metadata: {} },
    deterministic: {
      verdict: 'pass',
      severity: 'low',
      reason: `${packs.length} audit scenario pack(s) selected`,
      differences: [],
      numericDelta: packs.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: 'pass',
  };
}
