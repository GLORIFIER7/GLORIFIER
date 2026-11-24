import { test, expect, type Page } from '@playwright/test';

const frontendUrl = process.env.FRONTEND_URL || 'https://glorifier.pages.dev';

async function signInWithDedicatedAccount(page: Page) {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Dedicated production E2E credentials required.');
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in to Command Center', exact: true }).click();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
}

test.describe('GLORIFIER production end-to-end', () => {
  test('authenticated session, API bridge, persistence, and major modules', async ({ page }) => {
    await signInWithDedicatedAccount(page);

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

    const tabs = ['overview','geas_architecture','ai_ceo','integrations','agent_network','discovery','sentinel','connections','mobile','scientists','agent_miner','compliance','control','footprints','broker'];
    const primaryTabs = new Set(['overview','ai_ceo','integrations','discovery','sentinel']);
    for (const tab of tabs) {
      if (!primaryTabs.has(tab)) {
        await page.getByRole('button', { name: /modules/i }).click();
      }
      const tabButton = page.locator('#tab-btn-' + tab);
      await expect(tabButton).toBeVisible();
      await tabButton.click();
      await expect(page.locator('body')).not.toContainText('The Command Center could not render.');
      await expect(page.locator('body')).not.toContainText('Application error');
    }

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();

    const refreshedSession = await page.evaluate(async () => {
      const r = await fetch('/api/auth/session', { cache: 'no-store' });
      return { status: r.status, body: await r.json() };
    });
    expect(refreshedSession.status).toBe(200);
    expect(refreshedSession.body.authenticated).toBe(true);

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    const postLogout = await page.evaluate(async () => {
      const r = await fetch('/api/app-state', { cache: 'no-store' });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    expect([401, 403]).toContain(postLogout.status);
  });

  test('mobile navigation remains usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInWithDedicatedAccount(page);
    await page.getByRole('button', { name: /^menu$/i }).click();
    await expect(page.locator('#mobile-navigation')).toBeVisible();
    await page.getByRole('button', { name: /binance \/ nft/i }).click();
    await expect(page.locator('body')).not.toContainText('The Command Center could not render.');
  });

  test('unauthenticated API routes remain protected', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: frontendUrl });
    const response = await context.request.get('/api/app-state');
    expect([401, 403]).toContain(response.status());
    await context.close();
  });
});
