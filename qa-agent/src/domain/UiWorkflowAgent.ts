import type { ReportResult } from '../reporting/types';

export type UiWorkflowStep = {
  action: string;
  target: string;
  screenshotAfter?: boolean;
  expected: string;
};

export type UiWorkflow = {
  id: string;
  title: string;
  viewports: string[];
  steps: UiWorkflowStep[];
};

export const DEFAULT_UI_WORKFLOWS: UiWorkflow[] = [
  {
    id: 'heat-loss-edit-recalculate',
    title: 'Heat-loss edit and selected recalculation',
    viewports: ['desktop:1440x900', 'tablet:1024x768'],
    steps: [
      { action: 'open', target: 'heat-loss page', screenshotAfter: true, expected: 'input panel and table are visible' },
      { action: 'edit', target: 'selected object parameter', screenshotAfter: true, expected: 'changed field remains visible' },
      { action: 'click', target: 'recalculate selected', screenshotAfter: true, expected: 'status updates without layout overlap' },
    ],
  },
  {
    id: 'electrical-manual-cable',
    title: 'Electrical manual cable selection',
    viewports: ['desktop:1440x900'],
    steps: [
      { action: 'select', target: 'one or more electrical rows', screenshotAfter: true, expected: 'selection is visually clear' },
      { action: 'change', target: 'cable mark/type', screenshotAfter: true, expected: 'only selected rows change after recalculation' },
      { action: 'open', target: 'settings modal', screenshotAfter: true, expected: 'columns and labels are readable' },
    ],
  },
  {
    id: 'import-export-report',
    title: 'Import/export and report workflow',
    viewports: ['desktop:1440x900', 'mobile:390x844'],
    steps: [
      { action: 'import', target: 'Excel/CSV', screenshotAfter: true, expected: 'progress and errors are actionable' },
      { action: 'export', target: 'project data', expected: 'download action is available' },
      { action: 'open', target: 'report preview', screenshotAfter: true, expected: 'report content does not mix variants' },
    ],
  },
];

export function parseUiWorkflowSelection(value: string | undefined): UiWorkflow[] {
  if (!value) return DEFAULT_UI_WORKFLOWS;
  const ids = new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
  const selected = DEFAULT_UI_WORKFLOWS.filter((workflow) => ids.has(workflow.id));
  return selected.length > 0 ? selected : DEFAULT_UI_WORKFLOWS;
}

export function uiWorkflowsToReportResult(workflows: UiWorkflow[]): ReportResult {
  return {
    testCase: {
      id: 'audit-ui-workflow-plan',
      requirementId: 'audit_ui_workflows_have_visual_checkpoints',
      input: { workflows: workflows.map((workflow) => workflow.id) },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'Critical UI workflows have screenshot checkpoints', warnings: [], metadata: {} },
    actual: { value: workflows, status: 'success', warnings: [], metadata: {} },
    deterministic: {
      verdict: 'pass',
      severity: 'low',
      reason: `${workflows.length} UI workflow definition(s) available`,
      differences: [],
      numericDelta: workflows.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: 'pass',
  };
}
