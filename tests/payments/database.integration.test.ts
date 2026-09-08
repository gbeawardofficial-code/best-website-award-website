import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  claimDelivery,
  db,
  findPayment,
  insertPayment,
  ownedPayment,
  saveTransaction,
  type PaymentRecord
} from '../../src/lib/server/payment-store';

describe.skipIf(process.env.BWA_DB_TEST !== '1')('live Neon payment concurrency', () => {
  const id = randomUUID();
  let row: PaymentRecord;
  beforeAll(async () => {
    row = (await insertPayment({
      id,
      owner_hash: 'ab'.repeat(32),
      details: 'integration-test-no-personal-data',
      amount: 285000,
      currency: 'LKR',
      terms_version: 'test',
      app_id: 'test-app',
      merchant_id: 'test-merchant',
      sandbox: true
    }))!;
  });
  afterAll(async () => {
    await db()`DELETE FROM bwa.nomination_payments WHERE id = ${id}::uuid AND app_id = 'test-app'`;
  });
  it('isolates nomination access by browser session', async () => {
    await expect(ownedPayment(id, 'wrong')).rejects.toThrow();
    expect((await ownedPayment(id, 'ab'.repeat(32))).id).toBe(id);
  });
  it('keeps confirmed payments confirmed when stale failure arrives', async () => {
    const transaction = { id: 'a'.repeat(24), state: 'CONFIRMED' };
    row = await saveTransaction(row, transaction, 'paid');
    row = await saveTransaction(row, { ...transaction, state: 'CANCELLED' }, 'failed');
    expect(row.state).toBe('paid');
    expect(row.provider_state).toBe('CONFIRMED');
  });
  it('allows only one concurrent email sender', async () => {
    const leases = await Promise.all([claimDelivery(id), claimDelivery(id), claimDelivery(id)]);
    expect(leases.filter(Boolean)).toHaveLength(1);
  });
  it('blocks automatic resend outside the email idempotency window', async () => {
    await db()`UPDATE bwa.nomination_payments SET email_first_attempt_at = now() - interval '25 hours', email_lock_until = NULL WHERE id = ${id}::uuid`;
    expect(await claimDelivery(id)).toBeUndefined();
    expect((await findPayment(id))?.state).toBe('paid');
  });
});
