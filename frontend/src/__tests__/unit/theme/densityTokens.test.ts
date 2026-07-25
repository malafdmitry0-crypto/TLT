import { describe, expect, it } from 'vitest';
import {
  CONTROL_HEIGHT_LG,
  CONTROL_HEIGHT_MD,
  CONTROL_HEIGHT_SM,
  appTheme,
} from '@/theme/appTheme';

describe('density tokens (Ant UI kit B)', () => {
  it('exposes small 22 / middle 26 / large 32', () => {
    expect(CONTROL_HEIGHT_SM).toBe(22);
    expect(CONTROL_HEIGHT_MD).toBe(26);
    expect(CONTROL_HEIGHT_LG).toBe(32);
  });

  it('aligns appTheme control heights with TLT density tokens', () => {
    expect(appTheme.token?.controlHeight).toBe(26);
    expect(appTheme.token?.controlHeightSM).toBe(22);
    expect(appTheme.token?.controlHeightLG).toBe(32);
    expect(appTheme.components?.Button?.controlHeight).toBe(26);
    expect(appTheme.components?.Input?.controlHeight).toBe(26);
    expect(appTheme.components?.Select?.controlHeight).toBe(26);
  });
});
