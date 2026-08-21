export type CodexCoreMode = 'audit_only' | 'fix_focused' | 'ui_proof' | 'release_gate';

export type EvidenceLayer =
  | 'documentation'
  | 'backend'
  | 'frontend'
  | 'database'
  | 'tests'
  | 'verification'
  | 'ticket'
  | 'report';

export type EvidenceStatus = 'exists' | 'missing' | 'not_checked';

export type EvidenceRef = {
  layer: EvidenceLayer;
  path: string;
  symbol?: string;
  required: boolean;
  status: EvidenceStatus;
  reason: string;
};

export type ImplementationSearch = {
  layer: Extract<EvidenceLayer, 'documentation' | 'backend' | 'frontend' | 'database' | 'tests'>;
  query: string;
  paths: string[];
  reason: string;
};

export type VerificationCommand = {
  id: string;
  command: string;
  args: string[];
  category: 'docs' | 'contracts' | 'formula' | 'backend' | 'frontend' | 'ui' | 'database' | 'release' | 'agent';
  required: boolean;
  reason: string;
};

export type FindingDraft = {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  evidence: string[];
  recommendation: string;
};

export type TicketDraft = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'triage' | 'ready' | 'needs_verification';
  labels: string[];
  expectedBehavior: string;
  evidence: string[];
  verificationCommandIds: string[];
};

export type BoardCard = {
  ticketId: string;
  title: string;
  severity: TicketDraft['severity'];
  labels: string[];
};

export type BoardColumn = {
  id: 'triage' | 'ready' | 'in_progress' | 'needs_verification' | 'done';
  title: string;
  cards: BoardCard[];
};

export type FunctionalAccuracyReportTemplate = {
  scope: string;
  docsChecked: string[];
  implementationSections: string[];
  verificationCommandIds: string[];
  residualRiskQuestions: string[];
};

export type CodexCorePlan = {
  version: 1;
  createdAt: string;
  scope: string;
  mode: CodexCoreMode;
  docs: EvidenceRef[];
  implementationSearches: ImplementationSearch[];
  verificationCommands: VerificationCommand[];
  findings: FindingDraft[];
  ticketDrafts: TicketDraft[];
  board: BoardColumn[];
  reportTemplate: FunctionalAccuracyReportTemplate;
};

export type CreateCodexCorePlanInput = {
  scope: string;
  mode?: CodexCoreMode;
  createdAt?: Date;
  repoRoot?: string;
};
