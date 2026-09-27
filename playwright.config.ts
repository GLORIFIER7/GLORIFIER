import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.FRONTEND_URL || 'https://glorifier-glorifier.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
