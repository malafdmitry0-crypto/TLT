import path from 'node:path';

import { writeUtf8FileUnderRoot } from '../shared/paths';
import type { Metadata } from '../shared/types';
import type { Report, ReportGenerator, ReportResult } from './types';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function compactJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function summary(results: ReportResult[]) {
  return {
    total: results.length,
    passed: results.filter((result) => result.finalVerdict === 'pass').length,
    failed: results.filter((result) => result.finalVerdict === 'fail').length,
    needsReview: results.filter((result) => result.finalVerdict === 'needs_review').length,
  };
}

function groupedFailures(results: ReportResult[]): Record<string, ReportResult[]> {
  return results
    .filter((result) => result.finalVerdict !== 'pass')
    .reduce<Record<string, ReportResult[]>>((groups, result) => {
      const key = result.deterministic.reason || result.llmJudge?.reason || result.finalVerdict;
      groups[key] = [...(groups[key] ?? []), result];
      return groups;
    }, {});
}

function renderHtml(report: Report): string {
  const rows = report.results
    .map(
      (result) => `<tr class="verdict-${escapeHtml(result.finalVerdict)}">
        <td>${escapeHtml(result.finalVerdict)}</td>
        <td>${escapeHtml(result.testCase.id)}</td>
        <td>${escapeHtml(result.testCase.requirementId)}</td>
        <td><pre>${compactJson(result.expected.value)}</pre></td>
        <td><pre>${compactJson(result.actual.value)}</pre></td>
        <td>${escapeHtml(result.deterministic.reason)}</td>
        <td><pre>${compactJson(result.deterministic.differences)}</pre></td>
        <td>${escapeHtml(result.llmJudge?.verdict ?? '')}</td>
      </tr>`,
    )
    .join('\n');

  const failureGroups = Object.entries(report.groupedFailures)
    .map(([reason, items]) => `<li><strong>${escapeHtml(reason)}</strong>: ${items.length}</li>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>QA Agent Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #1f2933;
      --muted: #64748b;
      --border: #d7dde5;
      --pass: #0f7b45;
      --fail: #b42318;
      --review: #9a5b00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header, main { max-width: 1280px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 12px; font-size: 18px; }
    .muted { color: var(--muted); }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 12px;
      margin-top: 20px;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
    }
    .metric strong { display: block; font-size: 24px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--border);
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #eef2f6;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
    }
    pre {
      margin: 0;
      max-width: 360px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
    }
    .verdict-pass td:first-child { color: var(--pass); font-weight: 700; }
    .verdict-fail td:first-child { color: var(--fail); font-weight: 700; }
    .verdict-needs_review td:first-child { color: var(--review); font-weight: 700; }
    @media (max-width: 820px) {
      header, main { padding: 16px; }
      .summary { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      table { display: block; overflow-x: auto; }
    }
  </style>
</head>
<body>
  <header>
    <h1>QA Agent Report</h1>
    <div class="muted">Generated at ${escapeHtml(report.metadata.generatedAt)}</div>
    <section class="summary">
      <div class="metric"><span>Total</span><strong>${report.summary.total}</strong></div>
      <div class="metric"><span>Passed</span><strong>${report.summary.passed}</strong></div>
      <div class="metric"><span>Failed</span><strong>${report.summary.failed}</strong></div>
      <div class="metric"><span>Needs review</span><strong>${report.summary.needsReview}</strong></div>
    </section>
  </header>
  <main>
    <h2>Failure Groups</h2>
    <ul>${failureGroups || '<li>No failures</li>'}</ul>
    <h2>Results</h2>
    <table>
      <thead>
        <tr>
          <th>Verdict</th>
          <th>Case</th>
          <th>Requirement</th>
          <th>Expected</th>
          <th>Actual</th>
          <th>Reason</th>
          <th>Differences</th>
          <th>LLM</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <h2>Metadata</h2>
    <pre>${compactJson(report.metadata)}</pre>
  </main>
</body>
</html>
`;
}

export class HtmlReportGenerator implements ReportGenerator {
  constructor(private readonly outputPath?: string) {}

  generate(results: ReportResult[], metadata: Metadata = {}): Report {
    const report: Report = {
      summary: summary(results),
      results,
      groupedFailures: groupedFailures(results),
      metadata: {
        generatedAt: new Date().toISOString(),
        ...metadata,
      },
    };

    if (this.outputPath) {
      writeUtf8FileUnderRoot(
        path.dirname(this.outputPath),
        this.outputPath,
        renderHtml(report),
        'HTML report output path',
      );
      report.metadata.reportPath = this.outputPath;
    }

    return report;
  }
}
