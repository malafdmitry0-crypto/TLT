import AxeBuilder from '@axe-core/playwright';
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
];

async function stabilize(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(250);
}

async function auditA11y(page: Page, label: string) {
  await stabilize(page);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Ant Design renders a hidden measurement row that duplicates interactive
    // table headers. It is not exposed to users, but axe treats the cloned
    // controls as focusable descendants of an aria-hidden node.
    .exclude('.ant-table-measure-row')
    .analyze();

  const violations = results.violations
    .filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 5).map((node) => ({
        target: node.target.join(' '),
        summary: node.failureSummary?.replace(/\s+/g, ' ').trim(),
      })),
    }));

  expect(
    violations,
    `${label}\n${violations
      .map(
        (violation) =>
          `${violation.impact}: ${violation.id} - ${violation.help}\n` +
          violation.nodes
            .map((node) => `  ${node.target}: ${node.summary ?? 'no failure summary'}`)
            .join('\n'),
      )
      .join('\n')}`,
  ).toEqual([]);
}

async function auditKeyboardFocus(page: Page, label: string) {
  const focusableCount = await page.evaluate(() => {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 1 &&
        rect.height > 1 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0.01
      );
    }).length;
  });

  const problems: string[] = [];
  const steps = Math.min(Math.max(focusableCount + 2, 8), 35);

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press('Tab');
    const issue = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body || active === document.documentElement) {
        return null;
      }

      const rect = active.getBoundingClientRect();
      const style = window.getComputedStyle(active);
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const isVisible = (element: HTMLElement) => {
        const elementRect = element.getBoundingClientRect();
        const elementStyle = window.getComputedStyle(element);
        return (
          elementRect.width > 1 &&
          elementRect.height > 1 &&
          elementRect.bottom > 0 &&
          elementRect.right > 0 &&
          elementRect.top < viewportHeight &&
          elementRect.left < viewportWidth &&
          elementStyle.display !== 'none' &&
          elementStyle.visibility !== 'hidden' &&
          Number(elementStyle.opacity || '1') > 0.01
        );
      };
      const visible =
        rect.width > 1 &&
        rect.height > 1 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < viewportHeight &&
        rect.left < viewportWidth &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0.01;

      if (visible) return null;

      const visibleComposite = active.closest<HTMLElement>(
        '.ant-select, .ant-checkbox-wrapper, .ant-radio-wrapper, .ant-segmented-item',
      );
      if (visibleComposite && isVisible(visibleComposite)) return null;

      const label =
        active.getAttribute('aria-label') ||
        active.getAttribute('title') ||
        active.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ||
        active.id ||
        active.className ||
        active.tagName.toLowerCase();

      return `${active.tagName.toLowerCase()} ${label} is focused but not visible`;
    });

    if (issue) problems.push(`tab ${index + 1}: ${issue}`);
  }

  expect(problems, `${label}\n${problems.join('\n')}`).toEqual([]);
}

async function auditPage(page: Page, label: string) {
  await auditA11y(page, label);
  await auditKeyboardFocus(page, label);
}

test.describe('Accessibility gate', () => {
  test.beforeAll(async () => {
    await ensureTestEmployee(API_BASE);
  });

  for (const viewport of VIEWPORTS) {
    test(`public pages satisfy a11y gate - ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/');
      await auditPage(page, `${viewport.name}: home`);

      await page.goto('/login');
      await auditPage(page, `${viewport.name}: login`);
    });

    test(`guest workspace satisfies a11y gate - ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await loginAsGuest(page);
      await auditPage(page, `${viewport.name}: heat calc`);

      await page.goto('/workspace/elec-calc');
      await auditPage(page, `${viewport.name}: electrical calc`);
    });

    test(`employee screens satisfy a11y gate - ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await loginAsTestEmployee(page);
      await auditPage(page, `${viewport.name}: employee workspace`);

      await page.getByRole('button', { name: 'Открыть', exact: true }).click();
      await expect(page).toHaveURL(/\/projects/);
      await auditPage(page, `${viewport.name}: projects`);
    });
  }
});
