import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  // Сериализуем: параллельные гостевые сессии с одного IP быстро упираются в
  // GUEST_SESSION_HOURLY_LIMIT rate-лимитер. Для CI-прогона всего ~20-30 сек.
  workers: 1,
  use: {
    // По умолчанию — порт фронтенда, поднятого через docker-compose.e2e.yml (3001).
    // Для прогона e2e поверх dev-стека: `E2E_BASE_URL=http://localhost:3003 npx playwright test`.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Используем системный Chrome когда нет встроенного Playwright-браузера
        // (например, в окружении без интернета). Включается через PLAYWRIGHT_CHROMIUM_CHANNEL=chrome.
        channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
      },
    },
  ],
});
