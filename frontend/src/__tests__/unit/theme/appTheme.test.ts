// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  APP_BUTTON_SCALE,
  CONTROL_HEIGHT_LG,
  CONTROL_HEIGHT_MD,
  CONTROL_HEIGHT_SM,
  appTheme,
} from '@/theme/appTheme';

describe('appTheme', () => {
  it('exports primary palette aligned with CSS tokens', () => {
    expect(appTheme.token?.colorPrimary).toBe('#1a5276');
    expect(appTheme.token?.colorLink).toBe('#2e86c1');
    expect(APP_BUTTON_SCALE).toBe(0.7);
  });

  it('keeps button density scale contract (explicit 22/26/32)', () => {
    const button = appTheme.components?.Button as { controlHeight?: number };
    expect(CONTROL_HEIGHT_SM).toBe(22);
    expect(CONTROL_HEIGHT_MD).toBe(26);
    expect(CONTROL_HEIGHT_LG).toBe(32);
    expect(button?.controlHeight).toBe(CONTROL_HEIGHT_MD);
    expect(appTheme.token?.controlHeight).toBe(CONTROL_HEIGHT_MD);
  });
});
