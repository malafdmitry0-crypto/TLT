import type { Page } from '@playwright/test';
import { collectHeatFormInspection } from './heat-form-layout-split.inspect-dom';

/** Run DOM layout inspection in the page context. */
export async function inspectHeatForm(page: Page) {
  return page.evaluate(collectHeatFormInspection);
}
