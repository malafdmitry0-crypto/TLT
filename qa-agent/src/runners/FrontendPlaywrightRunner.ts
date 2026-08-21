import { getByPath } from '../shared/types';
import type { TestCase } from '../test-generation/types';
import type { AppRunner } from './AppRunner';
import type { ActualResult } from './types';

type FrontendAction =
  | { type: 'fill'; selector: string; valueFromInput: string }
  | { type: 'click'; selector: string }
  | { type: 'waitForSelector'; selector: string };

export class FrontendPlaywrightRunner implements AppRunner {
  constructor(private readonly baseUrl: string) {}

  async run(testCase: TestCase): Promise<ActualResult> {
    if (process.env.QA_AGENT_E2E !== '1') {
      return {
        value: null,
        raw: null,
        status: 'skipped',
        metadata: {
          reason: 'FrontendPlaywrightRunner requires QA_AGENT_E2E=1',
        },
      };
    }

    const pagePath = typeof testCase.metadata.url === 'string' ? testCase.metadata.url : '/';
    const actions = Array.isArray(testCase.metadata.actions)
      ? (testCase.metadata.actions as FrontendAction[])
      : [];
    const resultSelector = testCase.metadata.resultSelector;

    if (typeof resultSelector !== 'string') {
      return {
        value: null,
        raw: null,
        status: 'error',
        metadata: { error: 'missing_result_selector' },
      };
    }

    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      await page.goto(new URL(pagePath, this.baseUrl).toString());
      for (const action of actions) {
        if (action.type === 'fill') {
          const value = getByPath(testCase.input, action.valueFromInput);
          await page.locator(action.selector).fill(String(value ?? ''));
        }
        if (action.type === 'click') {
          await page.locator(action.selector).click();
        }
        if (action.type === 'waitForSelector') {
          await page.locator(action.selector).waitFor();
        }
      }
      const text = await page.locator(resultSelector).first().textContent();
      const numeric = text === null ? Number.NaN : Number(text.replace(',', '.'));
      return {
        value: Number.isFinite(numeric) ? numeric : text,
        raw: { text },
        status: 'success',
        metadata: { resultSelector, url: page.url() },
      };
    } catch (error) {
      return {
        value: null,
        raw: null,
        status: 'error',
        metadata: { error: error instanceof Error ? error.message : String(error) },
      };
    } finally {
      await browser.close();
    }
  }
}
