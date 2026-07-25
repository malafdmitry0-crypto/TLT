/**
 * Ant Design ConfigProvider theme — single app-wide SoT.
 * Keep palette aligned with CSS tokens in styles/tokens.css.
 *
 * Density (AF Ant UI kit B):
 *   small 22 / middle 26 / large 32 — explicit tokens, not APP_BUTTON_SCALE math.
 *   TLT form controls use middle (26); comfortable chrome uses large (32).
 */
import { theme, type ThemeConfig } from 'antd';

/** @deprecated Prefer CONTROL_HEIGHT_* tokens; kept for any legacy import. */
export const APP_BUTTON_SCALE = 0.7;

export const CONTROL_HEIGHT_SM = 22;
export const CONTROL_HEIGHT_MD = 26;
export const CONTROL_HEIGHT_LG = 32;

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1a5276',
    colorLink: '#2e86c1',
    borderRadius: 4,
    borderRadiusSM: 2,
    controlHeight: CONTROL_HEIGHT_MD,
    controlHeightSM: CONTROL_HEIGHT_SM,
    controlHeightLG: CONTROL_HEIGHT_LG,
    fontSize: 12,
  },
  components: {
    Button: {
      controlHeight: CONTROL_HEIGHT_MD,
      controlHeightSM: CONTROL_HEIGHT_SM,
      controlHeightLG: CONTROL_HEIGHT_LG,
      contentFontSize: 12,
      contentFontSizeSM: 11,
      contentFontSizeLG: 14,
      paddingInline: 10,
      paddingInlineSM: 7,
      paddingInlineLG: 12,
      borderRadius: 2,
    },
    Input: {
      controlHeight: CONTROL_HEIGHT_MD,
      controlHeightSM: CONTROL_HEIGHT_SM,
      controlHeightLG: CONTROL_HEIGHT_LG,
      borderRadius: 2,
      paddingInline: 3,
      fontSize: 12,
    },
    InputNumber: {
      controlHeight: CONTROL_HEIGHT_MD,
      controlHeightSM: CONTROL_HEIGHT_SM,
      controlHeightLG: CONTROL_HEIGHT_LG,
      borderRadius: 2,
      fontSize: 12,
    },
    Select: {
      controlHeight: CONTROL_HEIGHT_MD,
      controlHeightSM: CONTROL_HEIGHT_SM,
      controlHeightLG: CONTROL_HEIGHT_LG,
      borderRadius: 2,
      fontSize: 12,
    },
  },
  algorithm: theme.defaultAlgorithm,
};
