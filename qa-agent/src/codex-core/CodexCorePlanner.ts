import fs from 'node:fs';
import path from 'node:path';

import type {
  BoardColumn,
  CodexCoreMode,
  CodexCorePlan,
  CreateCodexCorePlanInput,
  EvidenceRef,
  EvidenceStatus,
  FindingDraft,
  ImplementationSearch,
  TicketDraft,
  VerificationCommand,
} from './types';

const BASE_DOCS: Array<Omit<EvidenceRef, 'status'>> = [
  {
    layer: 'documentation',
    path: 'qa-agent/examples/tlt-formulas.registry.yaml',
    required: true,
    reason: 'Machine-readable formula/algorithm registry (project Markdown removed).',
  },
];

const FORMULA_DOCS: Array<Omit<EvidenceRef, 'status'>> = [
  {
    layer: 'documentation',
    path: 'qa-agent/examples/tlt-formulas.registry.yaml',
    required: true,
    reason: 'Formula registry for oracle and formula QA.',
  },
  {
    layer: 'backend',
    path: 'backend/app/formulas',
    required: true,
    reason: 'Authoritative formula implementation.',
  },
];

const SRS_DOCS: Array<Omit<EvidenceRef, 'status'>> = [];

function statusFor(repoRoot: string | undefined, relativePath: string): EvidenceStatus {
  if (!repoRoot) return 'not_checked';
  return fs.existsSync(path.resolve(repoRoot, relativePath)) ? 'exists' : 'missing';
}

function uniqueDocs(docs: Array<Omit<EvidenceRef, 'status'>>, repoRoot?: string): EvidenceRef[] {
  const seen = new Set<string>();
  return docs
    .filter((doc) => {
      const key = `${doc.layer}:${doc.path}:${doc.symbol ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((doc) => ({
      ...doc,
      status: statusFor(repoRoot, doc.path),
    }));
}

function slugScope(scope: string): string {
  const slug = scope
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'functional-scope';
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function inferMode(scope: string, requested?: CodexCoreMode): CodexCoreMode {
  if (requested) return requested;
  const normalized = scope.toLowerCase();
  if (hasAny(normalized, ['layout', 'ui', 'ux', 'screen', 'page', 'форма', 'экран', 'разметк'])) {
    return 'ui_proof';
  }
  if (hasAny(normalized, ['release', 'gate', 'pre-release', 'релиз', 'предрелиз'])) {
    return 'release_gate';
  }
  if (hasAny(normalized, ['audit', 'review', 'аудит', 'провер'])) {
    return 'audit_only';
  }
  return 'fix_focused';
}

function isFormulaScope(scope: string): boolean {
  return hasAny(scope.toLowerCase(), [
    'formula',
    'calc',
    'heat',
    'loss',
    'cable',
    'specification',
    'формул',
    'расчет',
    'расчёт',
    'тепло',
    'кабель',
    'спецификац',
  ]);
}

function isBackendScope(scope: string): boolean {
  return hasAny(scope.toLowerCase(), [
    'api',
    'backend',
    'service',
    'database',
    'db',
    'persistence',
    'import',
    'export',
    'report',
    'бд',
    'эндпоинт',
    'сервис',
    'сохран',
    'импорт',
    'экспорт',
    'отчет',
    'отчёт',
  ]);
}

function isFrontendScope(scope: string): boolean {
  return hasAny(scope.toLowerCase(), [
    'frontend',
    'ui',
    'ux',
    'page',
    'component',
    'workflow',
    'layout',
    'форма',
    'экран',
    'страниц',
    'компонент',
    'разметк',
  ]);
}

function implementationSearches(scope: string): ImplementationSearch[] {
  const query = scope.trim() || 'feature keyword';
  const searches: ImplementationSearch[] = [
    {
      layer: 'documentation',
      query,
      paths: ['backend/app/formulas', 'qa-agent/examples', 'frontend/src'],
      reason: 'Find the requirement or explicitly mark it as undocumented.',
    },
    {
      layer: 'backend',
      query,
      paths: [
        'backend/app/api/v1',
        'backend/app/services',
        'backend/app/schemas',
        'backend/app/models',
        'backend/app/formulas',
      ],
      reason: 'Find API endpoints, service behavior, schemas, models and formulas.',
    },
    {
      layer: 'frontend',
      query,
      paths: ['frontend/src/pages', 'frontend/src/components', 'frontend/src/api', 'frontend/src/store', 'frontend/src/hooks'],
      reason: 'Find UI workflow, payload shaping and client-side state.',
    },
    {
      layer: 'tests',
      query,
      paths: ['backend/app/tests', 'frontend/src', 'e2e/tests', 'qa-agent/tests'],
      reason: 'Find existing unit, integration, e2e and agent tests.',
    },
  ];

  if (isBackendScope(scope)) {
    searches.push({
      layer: 'database',
      query,
      paths: ['backend/alembic/versions', 'scripts/db-business-invariants.sql'],
      reason: 'Check persisted side effects, migrations and DB invariants.',
    });
  }

  return searches;
}

function command(id: string, commandLine: string, category: VerificationCommand['category'], reason: string): VerificationCommand {
  const [cmd, ...args] = commandLine.split(' ');
  return {
    id,
    command: cmd,
    args,
    category,
    required: true,
    reason,
  };
}

function verificationCommands(scope: string, mode: CodexCoreMode): VerificationCommand[] {
  const commands: VerificationCommand[] = [
    command(
      'qa-agent-typecheck',
      'npm --prefix qa-agent run typecheck',
      'agent',
      'The Codex-core scaffold is TypeScript and must compile before use.',
    ),
    command(
      'qa-agent-test',
      'npm --prefix qa-agent test',
      'agent',
      'Focused tests prove the planning layer remains deterministic.',
    ),
    command(
      'contracts',
      'scripts/codex-functional-audit.sh contracts',
      'contracts',
      'Contract matrix verifies docs -> formula -> API -> UI -> tests traceability for critical functions.',
    ),
  ];

  if (isFormulaScope(scope)) {
    commands.push(
      command('formula-quick', 'scripts/formula-qa.sh quick', 'formula', 'Formula scopes require golden/boundary/metamorphic evidence.'),
      command('calc-gate', 'scripts/codex-functional-audit.sh calc', 'formula', 'Calculation gate covers formula service guards and API/object integration.'),
    );
  }

  if (isBackendScope(scope)) {
    commands.push(
      command('backend-unit', 'scripts/test.sh backend-unit', 'backend', 'Backend scopes require unit/service verification.'),
      command('backend-int', 'scripts/test.sh backend-int', 'backend', 'API and persistence scopes require integration verification.'),
      command(
        'db-invariants',
        'scripts/codex-functional-audit.sh db-invariants',
        'database',
        'Persisted workflows require DB invariant evidence after the scenario.',
      ),
    );
  }

  if (isFrontendScope(scope) || mode === 'ui_proof') {
    commands.push(
      command('frontend', 'scripts/test.sh frontend', 'frontend', 'Frontend scopes require component or integration test evidence.'),
      command('layout', 'scripts/codex-functional-audit.sh layout', 'ui', 'UI/layout scopes require clipping/overflow/overlap verifier evidence.'),
      command('accessibility', 'scripts/codex-functional-audit.sh accessibility', 'ui', 'Visible workflow changes should keep serious accessibility regressions out.'),
    );
  }

  if (mode === 'release_gate') {
    commands.push(
      command('release-all', 'scripts/codex-functional-audit.sh all', 'release', 'Release gate baseline for docs, smoke, business, UI and DB invariants.'),
      command('release-deep', 'scripts/codex-functional-audit.sh deep', 'release', 'Deep gate adds full backend/frontend and warnings checks when release confidence is required.'),
    );
  }

  const seen = new Set<string>();
  return commands.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function draftFindings(scopeSlug: string, docs: EvidenceRef[]): FindingDraft[] {
  const missingDocs = docs.filter((doc) => doc.status === 'missing');
  if (missingDocs.length === 0) return [];
  return [
    {
      id: `${scopeSlug}-missing-required-docs`,
      severity: 'high',
      title: 'Required functional accuracy documents are missing',
      evidence: missingDocs.map((doc) => doc.path),
      recommendation: 'Restore the missing source documents or narrow the scope before accepting functional accuracy evidence.',
    },
  ];
}

function ticketDrafts(scope: string, commands: VerificationCommand[]): TicketDraft[] {
  const scopeSlug = slugScope(scope);
  const allCommandIds = commands.map((item) => item.id);
  const tickets: TicketDraft[] = [
    {
      id: `FA-${scopeSlug}-001`,
      title: `Build evidence chain for ${scope}`,
      severity: 'high',
      status: 'triage',
      labels: ['functional-accuracy', 'evidence-chain'],
      expectedBehavior:
        'Requirement, backend implementation, frontend workflow, tests and verification results are linked in one report.',
      evidence: [
        'Documentation source path and requirement symbol',
        'Backend API/service/schema/model refs',
        'Frontend page/component/API refs',
        'Relevant test refs and command results',
      ],
      verificationCommandIds: allCommandIds,
    },
    {
      id: `FA-${scopeSlug}-002`,
      title: `Close test coverage gaps for ${scope}`,
      severity: 'medium',
      status: 'triage',
      labels: ['qa', 'focused-test'],
      expectedBehavior:
        'If existing tests do not prove the business contract, add a focused test or record the residual risk as out of scope.',
      evidence: ['Existing tests found by rg', 'Focused test or explicit residual risk'],
      verificationCommandIds: allCommandIds.filter((id) => id !== 'release-deep'),
    },
  ];

  if (isFrontendScope(scope)) {
    tickets.push({
      id: `FA-${scopeSlug}-003`,
      title: `Capture UI proof for ${scope}`,
      severity: 'high',
      status: 'triage',
      labels: ['ui-proof', 'playwright'],
      expectedBehavior:
        'Before/after screenshots and verifier evidence cover clipping, overflow, overlap, readability and disabled controls.',
      evidence: ['Before screenshot', 'DOM/CSS root cause', 'After screenshot', 'Layout verifier output'],
      verificationCommandIds: ['frontend', 'layout', 'accessibility'].filter((id) => allCommandIds.includes(id)),
    });
  }

  return tickets;
}

function boardFromTickets(tickets: TicketDraft[]): BoardColumn[] {
  const columns: BoardColumn[] = [
    { id: 'triage', title: 'Triage', cards: [] },
    { id: 'ready', title: 'Ready', cards: [] },
    { id: 'in_progress', title: 'In Progress', cards: [] },
    { id: 'needs_verification', title: 'Needs Verification', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
  ];
  const byStatus = new Map(columns.map((column) => [column.id, column]));
  for (const ticket of tickets) {
    byStatus.get(ticket.status)?.cards.push({
      ticketId: ticket.id,
      title: ticket.title,
      severity: ticket.severity,
      labels: ticket.labels,
    });
  }
  return columns;
}

export function createCodexCorePlan(input: CreateCodexCorePlanInput): CodexCorePlan {
  const scope = input.scope.trim() || 'functional accuracy scope';
  const mode = inferMode(scope, input.mode);
  const docsToCheck = [BASE_DOCS, SRS_DOCS, isFormulaScope(scope) ? FORMULA_DOCS : []].flat();
  const docs = uniqueDocs(docsToCheck, input.repoRoot);
  const commands = verificationCommands(scope, mode);
  const tickets = ticketDrafts(scope, commands);
  const scopeSlug = slugScope(scope);

  return {
    version: 1,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    scope,
    mode,
    docs,
    implementationSearches: implementationSearches(scope),
    verificationCommands: commands,
    findings: draftFindings(scopeSlug, docs),
    ticketDrafts: tickets,
    board: boardFromTickets(tickets),
    reportTemplate: {
      scope,
      docsChecked: docs.map((doc) => doc.path),
      implementationSections: ['Backend', 'Frontend', 'Tests'],
      verificationCommandIds: commands.map((item) => item.id),
      residualRiskQuestions: [
        'Is the requirement undocumented or ambiguous?',
        'Do frontend payload units match backend schemas?',
        'Is persistence/reload evidence required for this scope?',
        'Does a formula result need independent golden/metamorphic/boundary evidence?',
        'Does UI proof require before/after screenshots?',
      ],
    },
  };
}

function formatCommand(commandToFormat: VerificationCommand): string {
  return [commandToFormat.command, ...commandToFormat.args].join(' ');
}

export function renderCodexCorePlanMarkdown(plan: CodexCorePlan): string {
  const docs = plan.docs
    .map((doc) => `- [${doc.status}] ${doc.path}${doc.symbol ? `#${doc.symbol}` : ''} - ${doc.reason}`)
    .join('\n');
  const searches = plan.implementationSearches
    .map(
      (search) =>
        `- ${search.layer}: rg -n "${search.query}" ${search.paths.join(' ')}\n  Reason: ${search.reason}`,
    )
    .join('\n');
  const commands = plan.verificationCommands
    .map((item) => `- ${item.id}: ${formatCommand(item)}\n  Reason: ${item.reason}`)
    .join('\n');
  const tickets = plan.ticketDrafts
    .map(
      (ticket) =>
        `- ${ticket.id} [${ticket.severity}] ${ticket.title}\n  Status: ${ticket.status}\n  Verify: ${ticket.verificationCommandIds.join(', ')}`,
    )
    .join('\n');
  const findings =
    plan.findings.length === 0
      ? '- none'
      : plan.findings
          .map((finding) => `- ${finding.id} [${finding.severity}] ${finding.title}: ${finding.evidence.join(', ')}`)
          .join('\n');

  return `# Codex Core Functional Accuracy Plan

Scope: ${plan.scope}
Mode: ${plan.mode}
Generated: ${plan.createdAt}

## Docs To Check
${docs}

## Implementation Search
${searches}

## Verification Commands
${commands}

## Draft Findings
${findings}

## Ticket Drafts
${tickets}

## Functional Accuracy Report Template

\`\`\`text
Functional Accuracy Report
Scope: ${plan.reportTemplate.scope}
Docs checked:
- ${plan.reportTemplate.docsChecked.join('\n- ')}
Implementation found:
- Backend: ...
- Frontend: ...
- Tests: ...
Verification:
- ${plan.reportTemplate.verificationCommandIds.join('\n- ')}
Findings:
- ...
Residual risk:
- ${plan.reportTemplate.residualRiskQuestions.join('\n- ')}
\`\`\`
`;
}

export function renderCodexCoreTicketsMarkdown(plan: CodexCorePlan): string {
  const tickets = plan.ticketDrafts
    .map(
      (ticket) => `## ${ticket.id}: ${ticket.title}

Status: ${ticket.status}
Severity: ${ticket.severity}
Labels: ${ticket.labels.join(', ')}

### Expected Behavior

${ticket.expectedBehavior}

### Evidence

${ticket.evidence.map((item) => `- ${item}`).join('\n')}

### Verification

${ticket.verificationCommandIds.map((id) => `- ${id}`).join('\n')}
`,
    )
    .join('\n');

  return `# Codex Core Local Tickets

Scope: ${plan.scope}
Generated: ${plan.createdAt}

These tickets are local Markdown work items. They are not synced to Jira,
GitHub, Linear or any external tracker.

${tickets}
`;
}

export function renderCodexCoreBoardMarkdown(plan: CodexCorePlan): string {
  const columns = plan.board
    .map((column) => {
      const cards =
        column.cards.length === 0
          ? '- empty'
          : column.cards
              .map((card) => `- [${card.severity}] ${card.ticketId}: ${card.title} (${card.labels.join(', ')})`)
              .join('\n');
      return `## ${column.title}

${cards}`;
    })
    .join('\n\n');

  return `# Codex Core Local Board

Scope: ${plan.scope}
Generated: ${plan.createdAt}

This board is stored only in the local repository as Markdown.

${columns}
`;
}
