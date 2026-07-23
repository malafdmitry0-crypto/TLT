/**
 * Ant Design ConfigProvider theme — single app-wide SoT.
 * Keep palette aligned with CSS tokens in styles/tokens.css.
 */
import { theme, type ThemeConfig } from 'antd';

/** Matches historical SC-03 button density (control heights scaled). */
export const APP_BUTTON_SCALE = 0.7;

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1a5276',
    colorLink: '#2e86c1',
    borderRadius: 4,
  },
  components: {
    Button: {
      controlHeight: 32 * APP_BUTTON_SCALE,
      controlHeightSM: 24 * APP_BUTTON_SCALE,
      controlHeightLG: 40 * APP_BUTTON_SCALE,
      contentFontSize: 14 * APP_BUTTON_SCALE,
      contentFontSizeSM: 14 * APP_BUTTON_SCALE,
      contentFontSizeLG: 16 * APP_BUTTON_SCALE,
      iconGap: 8 * APP_BUTTON_SCALE,
      paddingInline: 15 * APP_BUTTON_SCALE,
      paddingInlineSM: 7 * APP_BUTTON_SCALE,
      paddingInlineLG: 15 * APP_BUTTON_SCALE,
    },
  },
  algorithm: theme.defaultAlgorithm,
};
