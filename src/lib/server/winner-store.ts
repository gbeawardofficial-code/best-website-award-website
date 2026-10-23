import { db } from './payment-store';
import { PaymentError } from './payment-config';
import type { WinnerResourceRecord } from '../claim/types';

export async function findWinner(website: string): Promise<WinnerResourceRecord | undefined> {
  const rows =
    await db()`SELECT programme_year, website_host, website_url, award_title, developer_name, active
    FROM bwa.winner_resources WHERE programme_year = 2026 AND website_host = ${website} AND active = true LIMIT 1`;
  return rows[0] as WinnerResourceRecord | undefined;
}

export async function limitWinnerLookups(key: string) {
  const rows = await db()`INSERT INTO bwa.winner_lookup_limits (key) VALUES (${key})
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN bwa.winner_lookup_limits.reset_at <= now() THEN 1 ELSE bwa.winner_lookup_limits.hits + 1 END,
      reset_at = CASE WHEN bwa.winner_lookup_limits.reset_at <= now() THEN now() + interval '15 minutes' ELSE bwa.winner_lookup_limits.reset_at END
    WHERE bwa.winner_lookup_limits.reset_at <= now() OR bwa.winner_lookup_limits.hits < 60
    RETURNING key`;
  if (!rows.length)
    throw new PaymentError('Please wait 15 minutes before checking more websites.', 429);
}
