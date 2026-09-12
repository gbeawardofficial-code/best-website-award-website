import { expect, test } from '@playwright/test';

test('footer badges remain clear, locally served and non-interactive', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const dismiss = page.getByRole('button', { name: 'Not now', exact: true });
  if (await dismiss.isVisible()) {
    await dismiss.focus();
    await dismiss.press('Enter');
  }
  const badges = page.locator('#footer-badges');
  await badges.scrollIntoViewIfNeeded();
  await expect(badges.locator('a, button, [tabindex]')).toHaveCount(0);
  await expect(badges.locator('img')).toHaveCount(3);
  await expect(badges.getByText('PageSpeed Insights', { exact: true })).toBeVisible();
  await expect(badges.getByText('Google Analytics', { exact: true })).toBeVisible();
  for (const img of await badges.locator('img').all()) {
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    expect(
      await img.evaluate(
        (el) => new URL((el as HTMLImageElement).currentSrc).origin === location.origin
      )
    ).toBe(true);
  }
  expect(await badges.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
  await badges.screenshot({
    path: `/tmp/bwa-footer-badges-${testInfo.project.name}.png`,
    animations: 'disabled',
    style: '.site-header, .skip-link, astro-dev-toolbar { visibility: hidden !important; }'
  });
});
