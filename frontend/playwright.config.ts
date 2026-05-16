import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e/tests',
  timeout: 30_000,
  retries: 0,
  outputDir: '../e2e/test-results',
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { outputFolder: '../e2e/playwright-report', open: 'never' }],
      ]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
