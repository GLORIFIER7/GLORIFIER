import { test, expect } from '@playwright/test';

const newTestCredentials = () => ({ email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: `GlorifierE2E-${Date.now()}!` });

test.describe('GLORIFIER production end-to-end', () => {
    test('authenticated session, API bridge, persistence, and major modules', async ({ page }) => {
    const { email, password } = newTestCredentials();
    await page.goto('/');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: /create a new account/i }).click();
    await page.getByLabel('Display name').fill('GLORIFIER E2E');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();

    const session = await page.evaluate(async () => {
      const r = await fetch('/api/auth/session', { cache: 'no-store' });
      return { status: r.status, body: await r.json() };
    });
    expect(session.status).toBe(200);
    expect(session.body.authenticated).toBe(true);
    expect(session.body.database?.connected).toBe(true);

    const state = await page.evaluate(async () => {
      const r = await fetch('/api/app-state', { cache: 'no-store' });
      return { status: r.status, body: await r.json() };
    });
    expect(state.status).toBe(200);
    expect(state.body.ok).toBe(true);

    const tabs = ['overview','ai_ceo','mediator','integrations','global_collaboration','discovery','ai_collaboration','sentinel','compute','accounts','binance','marketplace','compensation','monetization_sprint','compliance','patent','exposures','revenue_verified','connections','scientists','control','gmail','drive','privacy_lab','footprints','broker','gpt_cowork'];
    for (const tab of tabs) {
      await expect(page.locator('#tab-btn-' + tab)).toBeVisible();
      await page.locator('#tab-btn-' + tab).click();
      await expect(page.locator('body')).not.toContainText('The Command Center could not render.');
      await expect(page.locator('body')).not.toContainText('Application error');
    }

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('mobile navigation remains usable', async ({ page }) => {
    const { email, password } = newTestCredentials();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: /create a new account/i }).click();
    await page.getByLabel('Display name').fill('GLORIFIER E2E');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
    await page.getByRole('button', { name: /^menu$/i }).click();
    await expect(page.locator('#mobile-navigation')).toBeVisible();
    await page.getByRole('button', { name: /binance \/ nft/i }).click();
    await expect(page.locator('body')).not.toContainText('The Command Center could not render.');
  });

  test('unauthenticated API routes remain protected', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: process.env.FRONTEND_URL || 'https://glorifier-glorifier.vercel.app' });
    const response = await context.request.get('/api/app-state');
    expect([401, 403]).toContain(response.status());
    await context.close();
  });
});
