import type { Preview } from '@storybook/react-vite';
import { StyleProvider } from '@ant-design/cssinjs';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import React from 'react';

/**
 * Mirror app runtime chrome for UI-kit density (see src/main.tsx):
 * tokens → base → vendor-overrides; StyleProvider hashPriority=low; appTheme.
 * tlt-form-controls / compact-fields load via @/components/ui-kit barrel.
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/vendor-overrides.css';
// `ObjectWizard` вешает класс `.inline-object-form`, но сам не импортирует ни
// одного стиля: хром формы приходит из HeatCalcWorkspaceLayout. Без этих файлов
// история показывает полураздетый компонент. Импорт живёт здесь, а не в фикстуре:
// зависимость components → pages запрещена ратчетом слоёв. Порядок — как на
// странице, от него зависит каскад; селекторы внутри ограничены зоной heat.
import '../src/pages/heatcalc/heatcalc-dual-form-shell.css';
import '../src/pages/heatcalc/heatcalc-side-form-layout.css';
import '../src/pages/heatcalc/heatcalc-field-chrome-core.css';
import '../src/pages/heatcalc/heatcalc-field-focus.css';
import '../src/pages/heatcalc/heatcalc-field-chrome.css';
import { appTheme } from '../src/theme/appTheme';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <StyleProvider hashPriority="low">
        <ConfigProvider locale={ruRU} theme={appTheme}>
          <div
            style={{
              fontFamily: 'var(--font-family-app)',
              color: 'var(--color-text, #1f1f1f)',
              maxWidth: 960,
            }}
          >
            <Story />
          </div>
        </ConfigProvider>
      </StyleProvider>
    ),
  ],
};

export default preview;
