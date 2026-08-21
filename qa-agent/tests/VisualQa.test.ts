import { describe, expect, it } from 'vitest';

import { MockLlmClient } from '../src/llm/MockLlmClient';
import {
  analyzeVisualQaScreenshots,
  parseVisualQaAnalysis,
  parseVisualQaUrls,
  parseVisualQaViewports,
  visualQaReportResult,
  type VisualQaScreenshot,
} from '../src/domain/VisualQa';

function screenshot(id: string): VisualQaScreenshot {
  return {
    id,
    url: 'http://127.0.0.1:3003/',
    viewport: { name: 'desktop', width: 1440, height: 900 },
    path: `/tmp/${id}.png`,
    dataUrl: 'data:image/png;base64,AAAA',
  };
}

describe('Visual QA', () => {
  it('parses URL and viewport env strings', () => {
    expect(parseVisualQaUrls('/,/login, /workspace ')).toEqual(['/', '/login', '/workspace']);
    expect(parseVisualQaViewports('desktop:1440x900,mobile:390x844')).toEqual([
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]);
  });

  it('normalizes LLM visual analysis JSON', () => {
    const analysis = parseVisualQaAnalysis({
      verdict: 'fail',
      summary: 'One blocking issue',
      findings: [
        {
          severity: 'high',
          viewport: 'mobile',
          url: '/',
          issue: 'Primary button is clipped',
          evidence: 'Only half of the button is visible',
          recommendation: 'Reduce toolbar width',
        },
      ],
    });

    expect(analysis.verdict).toBe('fail');
    expect(analysis.findings[0].severity).toBe('high');
  });

  it('passes screenshots to the LLM request as image inputs', async () => {
    const llm = new MockLlmClient({
      verdict: 'pass',
      summary: 'No visible defects',
      findings: [],
    });
    const analysis = await analyzeVisualQaScreenshots(llm, [screenshot('home-desktop')]);

    expect(analysis.verdict).toBe('pass');
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].images).toHaveLength(1);
    expect(llm.calls[0].images?.[0].dataUrl).toContain('data:image/png;base64');
  });

  it('converts visual analysis to a QA report result', () => {
    const result = visualQaReportResult({
      screenshots: [screenshot('home-desktop')],
      analysis: {
        verdict: 'needs_review',
        summary: 'Ambiguous screenshot',
        findings: [],
      },
    });

    expect(result.testCase.id).toBe('visual-ai-screenshot-review');
    expect(result.finalVerdict).toBe('needs_review');
    expect(result.llmJudge?.verdict).toBe('needs_review');
  });
});
