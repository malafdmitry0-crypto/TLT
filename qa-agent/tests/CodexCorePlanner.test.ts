import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createCodexCorePlan,
  renderCodexCoreBoardMarkdown,
  renderCodexCorePlanMarkdown,
  renderCodexCoreTicketsMarkdown,
} from '../src/codex-core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Codex core planner', () => {
  it('creates a formula-oriented functional accuracy plan', () => {
    const plan = createCodexCorePlan({
      scope: 'pipe heat loss formula',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      repoRoot,
    });

    expect(plan.mode).toBe('fix_focused');
    expect(plan.docs.map((doc) => doc.path)).toContain('qa-agent/examples/tlt-formulas.registry.yaml');
    expect(plan.docs.map((doc) => doc.path)).toContain('backend/app/formulas');
    expect(plan.verificationCommands.map((command) => command.id)).toContain('formula-quick');
    expect(plan.verificationCommands.map((command) => command.id)).toContain('calc-gate');
    expect(plan.ticketDrafts[0].title).toContain('pipe heat loss formula');
  });

  it('infers UI proof mode and UI gates from UI scope', () => {
    const plan = createCodexCorePlan({
      scope: 'HeatCalcPage layout overflow',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      repoRoot,
    });

    expect(plan.mode).toBe('ui_proof');
    expect(plan.verificationCommands.map((command) => command.id)).toContain('layout');
    expect(plan.verificationCommands.map((command) => command.id)).toContain('accessibility');
    expect(plan.ticketDrafts.some((ticket) => ticket.labels.includes('ui-proof'))).toBe(true);
  });

  it('renders a markdown plan with report template and tickets', () => {
    const plan = createCodexCorePlan({
      scope: 'specification from electrical variant',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      repoRoot,
    });
    const markdown = renderCodexCorePlanMarkdown(plan);

    expect(markdown).toContain('Functional Accuracy Report');
    expect(markdown).toContain('Ticket Drafts');
    expect(markdown).toContain('scripts/codex-functional-audit.sh contracts');
  });

  it('renders local-only markdown tickets and board', () => {
    const plan = createCodexCorePlan({
      scope: 'local markdown board',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      repoRoot,
    });
    const tickets = renderCodexCoreTicketsMarkdown(plan);
    const board = renderCodexCoreBoardMarkdown(plan);

    expect(tickets).toContain('not synced to Jira');
    expect(tickets).toContain('FA-local-markdown-board-001');
    expect(board).toContain('stored only in the local repository');
    expect(board).toContain('## Triage');
  });
});
