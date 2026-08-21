import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HtmlReportGenerator } from '../src/reporting/HtmlReportGenerator';
import type { ReportResult } from '../src/reporting/types';

function result(finalVerdict: ReportResult['finalVerdict']): ReportResult {
  return {
    testCase: {
      id: `case-${finalVerdict}`,
      requirementId: 'req-1',
      input: { value: 1 },
      kind: 'fixed',
      metadata: {},
    },
    expected: { value: 1, warnings: [], metadata: {} },
    actual: {
      value: finalVerdict === 'pass' ? 1 : 2,
      status: 'success',
      warnings: [],
      metadata: {},
    },
    deterministic: {
      verdict: finalVerdict,
      severity: finalVerdict === 'pass' ? 'low' : 'high',
      reason: finalVerdict === 'pass' ? 'Values match' : 'Values differ',
      differences: [],
      numericDelta: finalVerdict === 'pass' ? 0 : 1,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict,
  };
}

describe('HtmlReportGenerator', () => {
  it('writes a standalone HTML report', () => {
    const outputPath = path.join(os.tmpdir(), `qa-agent-report-${Date.now()}.html`);
    const report = new HtmlReportGenerator(outputPath).generate([result('pass'), result('fail')], {
      mode: 'test',
    });

    const html = fs.readFileSync(outputPath, 'utf8');
    expect(report.summary.total).toBe(2);
    expect(report.summary.failed).toBe(1);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('QA Agent Report');
    expect(html).toContain('case-fail');
  });
});
