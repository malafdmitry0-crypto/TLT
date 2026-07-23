import { describe, expect, it } from 'vitest';
import { APP_BUTTON_SCALE, appTheme } from '@/theme/appTheme';

describe('appTheme', () => {
  it('exports primary palette aligned with CSS tokens', () => {
    expect(appTheme.token?.colorPrimary).toBe('#1a5276');
    expect(appTheme.token?.colorLink).toBe('#2e86c1');
    expect(APP_BUTTON_SCALE).toBe(0.7);
  });

  it('keeps button density scale contract', () => {
    const button = appTheme.components?.Button as { controlHeight?: number };
    expect(button?.controlHeight).toBe(32 * APP_BUTTON_SCALE);
  });
});
