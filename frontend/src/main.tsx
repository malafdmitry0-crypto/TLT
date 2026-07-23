import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleProvider } from '@ant-design/cssinjs';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import App from './App';
/**
 * Global CSS import order (architecture contract — enforced by cssArchitectureRatchet):
 * 1 tokens → 2 base → 3 app-shell → 4 vendor-overrides
 * 5 styles.css freeze stub
 * 6 shared feature globals (spreadsheet / chrome / print)
 * tlt-form-controls.css is NOT global — owned by form-controls / ui-kit entry.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/app-shell.css';
import './styles/vendor-overrides.css';
import './styles.css';
import './styles/calc-spreadsheet.css';
import './styles/actionbar-srs.css';
import './styles/table-chrome.css';
import './styles/form-grid-srs.css';
import './styles/print.css';
import { appTheme } from '@/theme/appTheme';
import { installClientAudit } from '@/utils/clientAudit';

installClientAudit();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* hashPriority=low → Ant CSS-in-JS uses :where (0 specificity); app CSS can drop !important */}
      <StyleProvider hashPriority="low">
        <ConfigProvider locale={ruRU} theme={appTheme}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </ConfigProvider>
      </StyleProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
