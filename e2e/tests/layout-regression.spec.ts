import { expect, test, type Page } from '@playwright/test';

import { ensureTestEmployee, loginAsTestEmployee } from './helpers/employee';
import { loginAsGuest } from './helpers/workspace';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8000';

type ViewportCase = {
  name: string;
  width: number;
  height: number;
};

const VIEWPORTS: ViewportCase[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
];

async function stabilize(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(250);
}

async function auditLayout(page: Page, label: string) {
  await stabilize(page);

  const issues = await page.evaluate(() => {
    type Rect = {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    };

    type Issue = {
      type: string;
      selector: string;
      details: string;
    };

    const issues: Issue[] = [];
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const tolerance = 8;

    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (el.classList.contains('ant-menu-submenu-title')) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      return (
        rect.width > 1 &&
        rect.height > 1 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < viewportHeight &&
        rect.left < viewportWidth &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0.01
      );
    };

    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const testId = el.getAttribute('data-testid');
      const aria = el.getAttribute('aria-label');
      const title = el.getAttribute('title');
      const className = String(el.getAttribute('class') || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((name) => `.${name}`)
        .join('');
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const meta = testId
        ? `[data-testid="${testId}"]`
        : aria
          ? `[aria-label="${aria}"]`
          : title
            ? `[title="${title}"]`
            : text
              ? ` "${text}"`
              : '';
      return `${el.tagName.toLowerCase()}${id}${className}${meta}`;
    };

    const rectOf = (el: Element): Rect => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const insideHorizontalScroll = (el: Element) => {
      let current: Element | null = el.parentElement;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        const scrollable =
          current.scrollWidth - current.clientWidth > tolerance &&
          ['auto', 'scroll'].includes(style.overflowX);
        if (scrollable) return true;
        current = current.parentElement;
      }
      return false;
    };

    const documentOverflow =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      viewportWidth;
    if (documentOverflow > tolerance) {
      issues.push({
        type: 'page-horizontal-overflow',
        selector: 'document',
        details: `scrollWidth exceeds viewport by ${documentOverflow}px`,
      });
    }

    const controlSelector = [
      'button',
      'input',
      'textarea',
      '[role="button"]',
      '[role="menuitem"]',
      '.ant-btn',
      '.ant-select-selector',
      '.ant-input-number',
      '.ant-picker',
      '.ant-checkbox-wrapper',
      '.ant-radio-wrapper',
    ].join(',');

    const controls = Array.from(document.querySelectorAll(controlSelector)).filter(visible);
    for (const el of controls) {
      const rect = rectOf(el);
      if (rect.left < -tolerance || rect.right > viewportWidth + tolerance) {
        if (insideHorizontalScroll(el)) continue;
        issues.push({
          type: 'control-outside-viewport',
          selector: describe(el),
          details: JSON.stringify(rect),
        });
      }
    }

    const textSelector = [
      'button',
      '.ant-btn',
      '.ant-menu-title-content',
      '.ant-tag',
      '.ant-card-head-title',
      '.ant-alert-message',
      '.ant-statistic-title',
      '.ant-statistic-content-value',
      '.ant-tabs-tab-btn',
      '.table-filter-trigger',
      'label',
      '[role="menuitem"]',
    ].join(',');

    const textNodes = Array.from(document.querySelectorAll<HTMLElement>(textSelector)).filter(
      visible,
    );
    for (const el of textNodes) {
      const style = window.getComputedStyle(el);
      const hasEllipsis = style.textOverflow === 'ellipsis';
      const text = (el.textContent || '').trim();
      if (!text || hasEllipsis) continue;
      if (el.scrollWidth - el.clientWidth > tolerance) {
        issues.push({
          type: 'text-horizontal-clipping',
          selector: describe(el),
          details: `scrollWidth=${el.scrollWidth}, clientWidth=${el.clientWidth}`,
        });
      }
      if (el.scrollHeight - el.clientHeight > tolerance && style.overflowY !== 'visible') {
        issues.push({
          type: 'text-vertical-clipping',
          selector: describe(el),
          details: `scrollHeight=${el.scrollHeight}, clientHeight=${el.clientHeight}`,
        });
      }
    }

    const sameInteractiveShell = (a: Element, b: Element) => {
      const shellSelector = [
        'button',
        'label',
        '.ant-btn',
        '.ant-select',
        '.ant-input-number',
        '.ant-checkbox-wrapper',
        '.ant-radio-wrapper',
        '.ant-menu-item',
        '.ant-form-item',
      ].join(',');
      const aShell = a.closest(shellSelector);
      const bShell = b.closest(shellSelector);
      return aShell !== null && aShell === bShell;
    };

    for (let i = 0; i < controls.length; i += 1) {
      const a = controls[i];
      const aRect = a.getBoundingClientRect();
      for (let j = i + 1; j < controls.length; j += 1) {
        const b = controls[j];
        if (a.contains(b) || b.contains(a) || sameInteractiveShell(a, b)) continue;

        const bRect = b.getBoundingClientRect();
        const x = Math.max(0, Math.min(aRect.right, bRect.right) - Math.max(aRect.left, bRect.left));
        const y = Math.max(0, Math.min(aRect.bottom, bRect.bottom) - Math.max(aRect.top, bRect.top));
        if (x <= 2 || y <= 2) continue;

        const overlapArea = x * y;
        const smallerArea = Math.min(aRect.width * aRect.height, bRect.width * bRect.height);
        if (smallerArea > 0 && overlapArea / smallerArea > 0.35) {
          issues.push({
            type: 'interactive-overlap',
            selector: `${describe(a)} <-> ${describe(b)}`,
            details: `overlap=${Math.round(overlapArea)}px2`,
          });
        }
      }
    }

    return issues.slice(0, 25);
  });

  expect(
    issues,
    `${label}\n${issues
      .map((issue) => `${issue.type}: ${issue.selector} (${issue.details})`)
      .join('\n')}`,
  ).toEqual([]);
}

test.describe('Layout regression', () => {
  test.beforeAll(async () => {
    await ensureTestEmployee(API_BASE);
  });

  for (const viewport of VIEWPORTS) {
    test(`public pages have no layout regressions — ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/');
      await auditLayout(page, `${viewport.name}: home`);

      await page.goto('/login');
      await auditLayout(page, `${viewport.name}: login`);
    });

    test(`guest workspace flow has no layout regressions — ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsGuest(page);
      await auditLayout(page, `${viewport.name}: heat calc`);

      await page.goto('/workspace/elec-calc');
      await auditLayout(page, `${viewport.name}: electrical calc`);

      await page.goto('/workspace/specification');
      await auditLayout(page, `${viewport.name}: specification`);

      await page.goto('/workspace/report');
      await auditLayout(page, `${viewport.name}: report`);
    });

    test(`employee project screens have no layout regressions — ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsTestEmployee(page);
      await auditLayout(page, `${viewport.name}: employee workspace`);

      await page.getByRole('button', { name: 'Открыть', exact: true }).click();
      await expect(page).toHaveURL(/\/projects/);
      await auditLayout(page, `${viewport.name}: projects`);
    });
  }
});
