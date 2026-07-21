import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/generated',
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  reporter: [['list'], ['json', { outputFile: 'playwright-report/results.json' }]],
});
