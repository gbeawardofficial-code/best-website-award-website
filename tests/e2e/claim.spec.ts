import { expect, test, type Page } from '@playwright/test';
import assets from '../../src/data/badge-assets-2026.json' with { type: 'json' };
import type { WinnerResources } from '../../src/lib/claim/types';
const winners = assets.winners as Record<string, WinnerResources>;
async function lookup(page: Page, website = 'accronautobot.com') {
  await page.route('**/api/claim/lookup', async (route) => {
    const input = JSON.parse(route.request().postData() || '{}').website as string;
    const host = new URL(input.startsWith('http') ? input : `https://${input}`).hostname.replace(
      /^www\./,
      ''
    );
    const winner = winners[host];
    await route.fulfill({ json: { ok: true, found: !!winner, ...(winner ? { winner } : {}) } });
  });
  await page.goto('/claim');
  await page.getByLabel('Website address', { exact: true }).fill(website);
  await page.getByRole('button', { name: 'Find my badges' }).click();
}
test('all four badges have clean accessible download choices and actual downloadable files', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await lookup(page);
  await expect(page.getByRole('heading', { name: 'Your winner badges.' })).toBeVisible();
  await expect(page.locator('[data-badge]')).toHaveCount(4);
  await expect(page.locator('[data-recipient-options]')).toBeHidden();
  for (const id of ['A-light', 'A-dark', 'C-light', 'C-dark']) {
    const button = page.locator(`[data-download="${id}"]`);
    await button.click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('radio', { name: /Medium/ })).toBeChecked();
    for (const size of ['Small', 'Medium', 'Large']) {
      await modal.getByRole('radio', { name: new RegExp(size) }).check();
      for (const format of ['PNG', 'WebP']) {
        await modal.getByRole('radio', { name: format, exact: true }).check();
        const link = modal.getByRole('link', { name: `Download ${format}` });
        const href = await link.getAttribute('href');
        expect(href).toContain(id);
        expect(href).toMatch(new RegExp(`\\.${format.toLowerCase()}$`));
        const response = await page.request.get(href!);
        expect(response.ok()).toBe(true);
        expect(response.headers()['content-type']).toContain(`image/${format.toLowerCase()}`);
      }
    }
    const downloadPromise = page.waitForEvent('download');
    await modal.getByRole('link', { name: 'Download WebP' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(`accronautobot.com-business-${id}`);
    expect(await download.failure()).toBeNull();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(button).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('developer selection is available only to the approved two and uses their exact artwork', async ({
  page
}) => {
  for (const [website, name] of [
    ['monarch-jewellers.com', 'DEGITALDEVS'],
    ['ceylonenvoy.com', 'Augmara']
  ]) {
    await lookup(page, website);
    await page.getByRole('radio', { name: 'Developer', exact: true }).check();
    await expect(page.locator('[data-developer-name]')).toHaveText(`Developer: ${name}`);
    for (const img of await page.locator('[data-badge] img').all())
      await expect(img).toHaveAttribute('src', /\/developer\//);
    await page.locator('[data-download="A-light"]').click();
    await expect(page.getByRole('dialog').locator('img')).toHaveAttribute('alt', new RegExp(name));
    await page.getByRole('button', { name: 'Close download options' }).click();
    await page.getByRole('radio', { name: 'Business', exact: true }).check();
    await expect(page.locator('[data-developer-name]')).toBeHidden();
    await expect(page.locator('[data-badge] img').first()).toHaveAttribute('src', /\/business\//);
    await page.unroute('**/api/claim/lookup');
  }
});
test('non-winners receive a friendly next-year message and can retry', async ({ page }) => {
  await lookup(page, 'not-selected.example.com');
  await expect(page.locator('[data-claim-panel="not-found"]')).toBeVisible();
  await expect(
    page.getByText(/We would love to see your nomination again next year/)
  ).toBeVisible();
  await expect(page.locator('[data-claim-panel="winner"]')).toBeHidden();
  await page.getByRole('button', { name: 'Check another website' }).click();
  await expect(page.getByLabel('Website address', { exact: true })).toBeFocused();
});
test('service errors remain retryable and are not mistaken for non-winners', async ({ page }) => {
  await page.route('**/api/claim/lookup', (route) =>
    route.fulfill({
      status: 503,
      json: {
        ok: false,
        message: 'This service is temporarily unavailable. Please try again shortly.'
      }
    })
  );
  await page.goto('/claim');
  await page.getByLabel('Website address', { exact: true }).fill('accronautobot.com');
  await page.getByRole('button', { name: 'Find my badges' }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.locator('[data-claim-panel="not-found"]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Find my badges' })).toBeEnabled();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
