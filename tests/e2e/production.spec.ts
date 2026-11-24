import { test, expect, type Page, type Response } from '@playwright/test';

const frontendUrl = process.env.FRONTEND_URL || 'https://glorifier.pages.dev';
const MODULE_IDS = ['overview','workspace','business_intelligence','geas_architecture','autonomous_core','ai_ceo','integrations','agent_network','token_branding','discovery','sentinel','connections','mobile','scientists','agent_miner','compliance','control','footprints','broker'];
const PRIMARY_MODULE_IDS = new Set(['overview','workspace','ai_ceo','integrations','discovery']);

async function assertModuleRendered(page: Page) {
  const main = page.locator('main');
  await expect(main).toBeVisible();
  await expect(main.getByText('Loading module…', { exact: false })).not.toBeVisible();
  await expect(main).not.toContainText('The Command Center could not render.');
  await expect(main).not.toContainText('Application error');
}

async function signInWithDedicatedAccount(page: Page) {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Dedicated production E2E credentials required.');
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  let firebaseStatus: number | undefined;
  let sessionStatus: number | undefined;
  const observe = (response: Response) => {
    const url = new URL(response.url());
    if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname === '/v1/accounts:signInWithPassword') {
      firebaseStatus = response.status();
    }
    if (url.origin === new URL(frontendUrl).origin && url.pathname === '/api/auth/session') {
      sessionStatus = response.status();
    }
  };
  page.on('response', observe);
  try {
    await page.getByRole('button', { name: 'Sign in to Command Center', exact: true }).click();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  } catch {
    throw new Error(`AUTH_E2E_FAILED: Firebase sign-in HTTP ${firebaseStatus ?? 'not observed'}; application session HTTP ${sessionStatus ?? 'not observed'}.`);
  } finally {
    page.off('response', observe);
  }
}

test.describe('GLORIFIER production end-to-end', () => {
  test('authenticated session, API bridge, persistence, and major modules', async ({ page }) => {
    test.setTimeout(120_000);
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

    const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
    for (const tab of MODULE_IDS) {
      if (!PRIMARY_MODULE_IDS.has(tab)) {
        await navigation.getByRole('button', { name: /^modules$/i }).click();
      }
      const tabButton = navigation.locator('#tab-btn-' + tab);
      await expect(tabButton).toBeVisible();
      await tabButton.click();
      await assertModuleRendered(page);
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
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInWithDedicatedAccount(page);
    for (const tab of MODULE_IDS) {
      await page.getByRole('button', { name: /^menu$/i }).click();
      const navigation = page.locator('#mobile-navigation');
      await expect(navigation).toBeVisible();
      await navigation.locator('#tab-btn-' + tab).click();
      await assertModuleRendered(page);
    }
  });

  test('unauthenticated API routes remain protected', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: frontendUrl });
    const response = await context.request.get('/api/app-state');
    expect([401, 403]).toContain(response.status());
    await context.close();
  });
});
