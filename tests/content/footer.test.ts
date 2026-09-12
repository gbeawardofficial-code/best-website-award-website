import { expect, it } from 'vitest';
import { getFooterBadges } from '../../src/lib/content/footer';

it('publishes local product artwork without links through typed footer content', async () => {
  const content = await getFooterBadges();
  expect(content.quality).not.toHaveProperty('href');
  expect(content.tools).toHaveLength(2);
  expect(content.tools.every((item) => !('href' in item))).toBe(true);
  expect(content.tools[1]!.description).toBe('Consent-based analytics');
  expect(
    content.tools.every(
      (item) => typeof item.image.src === 'string' && item.image.src.startsWith('/images/services/')
    )
  ).toBe(true);
  expect(JSON.stringify(content.tools)).not.toMatch(/certified|endorsed|100\/100/i);
});
