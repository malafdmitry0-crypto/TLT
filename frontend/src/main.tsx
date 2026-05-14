import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import App from './App';
import './styles.css';

const BUTTON_SCALE = 0.7;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={ruRU}
        theme={{
          token: {
            colorPrimary: '#1a5276',
            colorLink: '#2e86c1',
            borderRadius: 4,
          },
          components: {
            Button: {
              controlHeight: 32 * BUTTON_SCALE,
              controlHeightSM: 24 * BUTTON_SCALE,
              controlHeightLG: 40 * BUTTON_SCALE,
              contentFontSize: 14 * BUTTON_SCALE,
              contentFontSizeSM: 14 * BUTTON_SCALE,
              contentFontSizeLG: 16 * BUTTON_SCALE,
              iconGap: 8 * BUTTON_SCALE,
              paddingInline: 15 * BUTTON_SCALE,
              paddingInlineSM: 7 * BUTTON_SCALE,
              paddingInlineLG: 15 * BUTTON_SCALE,
            },
          },
          algorithm: theme.defaultAlgorithm,
        }}
      >
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
