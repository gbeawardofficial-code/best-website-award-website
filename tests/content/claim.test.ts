import { describe, expect, it } from 'vitest';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import records from '../../src/data/winners-2026.json';
import manifest from '../../src/data/badge-assets-2026.json';
import { getClaimContent, resourcesForWinner } from '../../src/lib/content/claim';
import { normaliseWebsite } from '../../src/lib/participation/policy';
import type { WinnerResourceRecord } from '../../src/lib/claim/types';

const record = (index: number): WinnerResourceRecord => ({
  programme_year: 2026,
  website_host: normaliseWebsite(records[index].website),
  website_url: records[index].website,
  award_title: records[index].award,
  developer_name: records[index].developer || null,
  active: true
});
describe('approved winner resources', () => {
  it('provides all 23 exact approved URLs and titles with no duplicate domains', () => {
    expect(records).toHaveLength(23);
    expect(new Set(records.map((r) => normaliseWebsite(r.website))).size).toBe(23);
    expect(Object.keys(manifest.winners)).toHaveLength(23);
    for (let i = 0; i < records.length; i++) {
      expect(resourcesForWinner(record(i))).toMatchObject({
        website: record(i).website_host,
        websiteUrl: records[i].website,
        award: records[i].award
      });
    }
  });
  it('offers developer badges only for explicitly approved websites and developers', () => {
    const developers = records
      .map((_, i) => resourcesForWinner(record(i))!)
      .filter((r) => r.developer);
    expect(developers.map((r) => [r.website, r.developer])).toEqual([
      ['ceylonenvoy.com', 'Augmara'],
      ['monarch-jewellers.com', 'DEGITALDEVS'],
      ['evergreen.lk', 'Codezela Technologies'],
      ['ceylonecospices.com', 'Codezela Technologies'],
      ['digitalhouse.lk', 'Codezela Technologies']
    ]);
    for (let i = 0; i < records.length; i++)
      expect(resourcesForWinner(record(i))!.roles).toHaveLength(records[i].developer ? 2 : 1);
  });
  it('requires active database approval and matching, already-exported artwork', () => {
    expect(resourcesForWinner(undefined)).toBeUndefined();
    expect(resourcesForWinner({ ...record(0), active: false })).toBeUndefined();
    expect(resourcesForWinner({ ...record(0), programme_year: 2027 })).toBeUndefined();
    expect(
      resourcesForWinner({ ...record(0), website_host: 'unapproved.example.com' })
    ).toBeUndefined();
    expect(() => resourcesForWinner({ ...record(0), award_title: 'Changed award' })).toThrow();
    expect(() =>
      resourcesForWinner({ ...record(0), developer_name: 'Unapproved developer' })
    ).toThrow();
    expect(() =>
      resourcesForWinner({ ...record(0), website_url: 'https://unapproved.example.com' })
    ).toThrow();
  });
  it('has four variants, three sizes and both formats for every approved recipient', async () => {
    let count = 0;
    for (let i = 0; i < records.length; i++)
      for (const role of resourcesForWinner(record(i))!.roles) {
        expect(role.badges.map((b) => b.id)).toEqual(['A-light', 'A-dark', 'C-light', 'C-dark']);
        for (const badge of role.badges) {
          expect(badge.sizes.map((s) => s.id)).toEqual(['small', 'medium', 'large']);
          expect(badge.preview.alt).toContain(records[i].award);
          for (const size of badge.sizes)
            for (const format of ['png', 'webp'] as const) {
              expect(size[format]).toMatch(/^\/winner-resources\/2026\/[a-f0-9]{12}\//);
              await access(resolve('public', `.${size[format]}`));
              count++;
            }
        }
      }
    expect(count).toBe(672);
    expect((await getClaimContent()).variants).toHaveLength(4);
  });
  it('keeps the claim page non-indexable and outside the public sitemap integration', async () => {
    const page = await readFile(resolve('src/pages/claim.astro'), 'utf8');
    const config = await readFile(resolve('astro.config.mjs'), 'utf8');
    expect(page).toContain('noIndex');
    expect(page).toContain('disableAnalytics');
    expect(page).toContain('ManagedPicture');
    expect(config).toContain("'/claim'");
  });
});
