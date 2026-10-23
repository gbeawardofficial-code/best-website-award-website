import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

// Explicit operator command only. Never runs in a build or in an HTTP request.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const records = JSON.parse(
  await readFile(new URL('../src/data/winners-2026.json', import.meta.url), 'utf8')
);
const host = (value) => new URL(value).hostname.toLowerCase().replace(/^www\./, '');
if (records.length !== 20 || new Set(records.map((r) => host(r.website))).size !== 20)
  throw new Error('Expected the 20 distinct, approved 2026 winner websites.');
const sql = neon(process.env.DATABASE_URL, {
  fetchOptions: { signal: AbortSignal.timeout(15_000) }
});
const migration = await readFile(
  new URL('../migrations/006_winner_resources.sql', import.meta.url),
  'utf8'
);
await sql.transaction([
  ...migration
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => sql.query(s)),
  ...records.map(
    (r) => sql`INSERT INTO bwa.winner_resources
    (programme_year, website_host, website_url, award_title, developer_name)
    VALUES (2026, ${host(r.website)}, ${r.website}, ${r.award}, ${r.developer || null})
    ON CONFLICT (programme_year, website_host) DO UPDATE SET
    website_url = EXCLUDED.website_url, award_title = EXCLUDED.award_title,
    developer_name = EXCLUDED.developer_name, active = true, updated_at = now()`
  )
]);
const saved = await sql`SELECT website_host, website_url, award_title, developer_name, active
  FROM bwa.winner_resources WHERE programme_year = 2026 ORDER BY website_host`;
for (const r of records) {
  const row = saved.find((s) => s.website_host === host(r.website));
  if (
    !row ||
    row.website_url !== r.website ||
    row.award_title !== r.award ||
    row.developer_name !== (r.developer || null) ||
    !row.active
  )
    throw new Error(`Winner verification failed: ${host(r.website)}`);
}
console.log(
  JSON.stringify(
    {
      verified: records.length,
      developerChoices: records
        .filter((r) => r.developer)
        .map((r) => ({ website: host(r.website), developer: r.developer })),
      nominationAndPaymentRecordsChanged: false
    },
    null,
    2
  )
);
