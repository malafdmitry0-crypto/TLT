import fs from 'node:fs';
import path from 'node:path';

import type { ComparisonResult } from '../comparison/types';
import type { LlmClient } from '../llm/LlmClient';
import { VISUAL_QA_SYSTEM_PROMPT } from '../llm/prompts';
import type { LlmJudgeResult } from '../llm/types';
import type { ReportResult } from '../reporting/types';
import { readBinaryFileUnderRoot, resolveUnderAllowedRoot } from '../shared/paths';
import type { Verdict } from '../shared/types';
import { isRecord } from '../shared/types';

export type VisualQaViewport = {
  name: string;
  width: number;
  height: number;
};

export type VisualQaScreenshot = {
  id: string;
  url: string;
  viewport: VisualQaViewport;
  path: string;
  dataUrl: string;
};

export type VisualQaFinding = {
  severity: 'low' | 'medium' | 'high';
  viewport: string;
  url: string;
  issue: string;
  evidence: string;
  recommendation: string;
};

export type VisualQaAnalysis = {
  verdict: Verdict;
  summary: string;
  findings: VisualQaFinding[];
};

export const DEFAULT_VISUAL_QA_VIEWPORTS: VisualQaViewport[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

function safeSegment(value: string): string {
  const cleaned = value
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9а-яА-Я_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'root';
}

function screenshotDataUrl(outputDir: string, filePath: string): string {
  const data = readBinaryFileUnderRoot(outputDir, filePath, 'visual QA screenshot path');
  return `data:image/png;base64,${data.toString('base64')}`;
}

export function parseVisualQaUrls(value: string | undefined): string[] {
  if (!value) return ['/'];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseVisualQaViewports(value: string | undefined): VisualQaViewport[] {
  if (!value) return DEFAULT_VISUAL_QA_VIEWPORTS;
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item): VisualQaViewport | undefined => {
      const match = /^([^:]+):(\d+)x(\d+)$/.exec(item);
      if (!match) return undefined;
      return {
        name: match[1],
        width: Number(match[2]),
        height: Number(match[3]),
      };
    })
    .filter((item): item is VisualQaViewport => Boolean(item));
  return parsed.length > 0 ? parsed : DEFAULT_VISUAL_QA_VIEWPORTS;
}

export async function captureVisualQaScreenshots(config: {
  baseUrl: string;
  urls: string[];
  viewports: VisualQaViewport[];
  outputDir: string;
  waitMs?: number;
  fullPage?: boolean;
}): Promise<VisualQaScreenshot[]> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const screenshots: VisualQaScreenshot[] = [];
  const outputDir = path.resolve(config.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    for (const viewport of config.viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      });
      for (const pageUrl of config.urls) {
        const resolvedUrl = new URL(pageUrl, config.baseUrl).toString();
        await page.goto(resolvedUrl, { waitUntil: 'networkidle' });
        if (config.waitMs && config.waitMs > 0) {
          await page.waitForTimeout(config.waitMs);
        }
        const id = `${safeSegment(pageUrl)}-${viewport.name}-${viewport.width}x${viewport.height}`;
        const filePath = resolveUnderAllowedRoot(outputDir, `${id}.png`, 'visual QA screenshot path');
        await page.screenshot({ path: filePath, fullPage: config.fullPage ?? false });
        screenshots.push({
          id,
          url: resolvedUrl,
          viewport,
          path: filePath,
          dataUrl: screenshotDataUrl(outputDir, filePath),
        });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  return screenshots;
}

function parseFinding(value: unknown): VisualQaFinding | undefined {
  if (!isRecord(value)) return undefined;
  const severity = value.severity;
  return {
    severity: severity === 'low' || severity === 'medium' || severity === 'high' ? severity : 'medium',
    viewport: typeof value.viewport === 'string' ? value.viewport : 'unknown',
    url: typeof value.url === 'string' ? value.url : '',
    issue: typeof value.issue === 'string' ? value.issue : 'Unspecified issue',
    evidence: typeof value.evidence === 'string' ? value.evidence : '',
    recommendation: typeof value.recommendation === 'string' ? value.recommendation : '',
  };
}

export function parseVisualQaAnalysis(value: unknown): VisualQaAnalysis {
  if (!isRecord(value)) {
    return {
      verdict: 'needs_review',
      summary: 'LLM returned non-object visual QA response',
      findings: [],
    };
  }
  const verdict = value.verdict;
  const findings = Array.isArray(value.findings)
    ? value.findings.map(parseFinding).filter((item): item is VisualQaFinding => Boolean(item))
    : [];
  return {
    verdict: verdict === 'pass' || verdict === 'fail' || verdict === 'needs_review' ? verdict : 'needs_review',
    summary: typeof value.summary === 'string' ? value.summary : 'No visual QA summary returned',
    findings,
  };
}

export async function analyzeVisualQaScreenshots(
  llmClient: LlmClient,
  screenshots: VisualQaScreenshot[],
): Promise<VisualQaAnalysis> {
  const response = await llmClient.completeJson({
    system: VISUAL_QA_SYSTEM_PROMPT,
    temperature: 0,
    user: JSON.stringify({
      task: 'Inspect screenshots and return visual QA findings.',
      screenshots: screenshots.map((screenshot, index) => ({
        imageIndex: index,
        id: screenshot.id,
        url: screenshot.url,
        viewport: screenshot.viewport.name,
        width: screenshot.viewport.width,
        height: screenshot.viewport.height,
      })),
      instructions: [
        'Tie each finding to a concrete viewport and URL.',
        'Report only visible issues.',
        'Mark fail for high-severity blocking layout defects.',
        'Mark needs_review when screenshots are ambiguous or not enough context is visible.',
      ],
    }),
    images: screenshots.map((screenshot) => ({
      label: screenshot.id,
      dataUrl: screenshot.dataUrl,
    })),
  });

  return parseVisualQaAnalysis(response);
}

function comparisonForAnalysis(analysis: VisualQaAnalysis): ComparisonResult {
  return {
    verdict: analysis.verdict,
    severity:
      analysis.verdict === 'pass'
        ? 'low'
        : analysis.findings.some((finding) => finding.severity === 'high')
          ? 'high'
          : 'medium',
    reason: analysis.summary,
    differences: analysis.findings.map((finding, index) => ({
      path: `findings[${index}]`,
      expected: 'No visible defect',
      actual: finding.issue,
      reason: `${finding.severity}: ${finding.evidence || finding.recommendation || finding.issue}`,
    })),
    numericDelta: 0,
    toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
  };
}

export function visualQaReportResult(args: {
  analysis: VisualQaAnalysis;
  screenshots: VisualQaScreenshot[];
}): ReportResult {
  const deterministic = comparisonForAnalysis(args.analysis);
  const llmJudge: LlmJudgeResult = {
    verdict: args.analysis.verdict,
    confidence: 1,
    reason: args.analysis.summary,
    criticalDifferences: args.analysis.findings.map((finding) => finding.issue),
  };
  return {
    testCase: {
      id: 'visual-ai-screenshot-review',
      requirementId: 'visual_ai_layout_review',
      input: {
        screenshots: args.screenshots.map((screenshot) => ({
          id: screenshot.id,
          url: screenshot.url,
          viewport: screenshot.viewport,
          path: screenshot.path,
        })),
      },
      kind: 'property',
      metadata: {
        screenshotCount: args.screenshots.length,
      },
    },
    expected: {
      value: 'No visible layout defects across configured viewports',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: args.analysis,
      status: 'success',
      warnings: [],
      metadata: {
        screenshots: args.screenshots.map((screenshot) => screenshot.path),
      },
    },
    deterministic,
    llmJudge,
    finalVerdict: deterministic.verdict,
  };
}
