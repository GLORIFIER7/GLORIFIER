import { defineConfig } from 'playwright';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.FRONTEND_URL || 'https://glorifier-glorifier.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['json', { outputFile: 'test-results/glorifier-e2e.json' }]],
});
