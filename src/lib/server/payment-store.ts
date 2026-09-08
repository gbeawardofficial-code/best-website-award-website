import { neon } from '@neondatabase/serverless';
import type { PaymentState } from '../payments/policy';
import { env, paymentConfig, PaymentError } from './payment-config';

export interface PaymentRecord {
  id: string;
  owner_hash: string;
  details: string;
  amount: number;
  currency: string;
  terms_version: string;
  app_id: string;
  merchant_id: string;
  sandbox: boolean;
  transaction_id: string | null;
  checkout_url: string | null;
  state: PaymentState;
  provider_state: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  check_after: string;
  email_first_attempt_at: string | null;
  email_sent_at: string | null;
}

export function db() {
  const url = env('DATABASE_URL');
  if (!url) throw new PaymentError('Payment storage is temporarily unavailable.');
  return neon(url, { fetchOptions: { signal: AbortSignal.timeout(5_000) } });
}

export async function findPayment(id: string): Promise<PaymentRecord | undefined> {
  const rows = await db()`SELECT * FROM bwa.nomination_payments WHERE id = ${id}::uuid`;
  return rows[0] as PaymentRecord | undefined;
}

export async function ownedPayment(id: string, owner: string) {
  const record = await findPayment(id);
  if (!record || record.owner_hash !== owner)
    throw new PaymentError(
      'This nomination is not available in this browser. Contact info@gbeaward.com with your payment reference if you have already paid.',
      404
    );
  return record;
}

export async function findPaymentByTransaction(id: string): Promise<PaymentRecord | undefined> {
  const rows = await db()`SELECT * FROM bwa.nomination_payments WHERE transaction_id = ${id}`;
  return rows[0] as PaymentRecord | undefined;
}

export async function insertPayment(
  record: Pick<
    PaymentRecord,
    | 'id'
    | 'owner_hash'
    | 'details'
    | 'amount'
    | 'currency'
    | 'terms_version'
    | 'app_id'
    | 'merchant_id'
    | 'sandbox'
  >
) {
  const rows =
    await db()`INSERT INTO bwa.nomination_payments (id, owner_hash, details, amount, currency, terms_version, app_id, merchant_id, sandbox)
    SELECT ${record.id}::uuid, ${record.owner_hash}, ${record.details}, ${record.amount}, ${record.currency}, ${record.terms_version}, ${record.app_id}, ${record.merchant_id}, ${record.sandbox}
    WHERE (SELECT count(*) FROM bwa.nomination_payments WHERE owner_hash = ${record.owner_hash} AND created_at > now() - interval '30 minutes') < 5
    ON CONFLICT (id) DO NOTHING RETURNING *`;
  return rows[0] as PaymentRecord | undefined;
}

export async function saveTransaction(
  record: PaymentRecord,
  t: { id: string; state: string },
  state: PaymentState,
  checkoutUrl?: string
) {
  // Paid is monotonic except for an explicit refund/void review. A stale webhook
  // cannot turn a confirmed nomination back into an unpaid one.
  const rows = await db()`UPDATE bwa.nomination_payments SET
    transaction_id = ${t.id}, checkout_url = COALESCE(${checkoutUrl || null}, checkout_url),
    state = CASE WHEN state = 'review' THEN 'review' WHEN ${state} = 'review' THEN 'review' WHEN state = 'paid' THEN 'paid' ELSE ${state} END,
    provider_state = CASE WHEN state = 'paid' AND ${state} NOT IN ('paid','review') THEN provider_state ELSE ${t.state} END,
    paid_at = CASE WHEN ${state} = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
    check_after = now() + interval '15 seconds', updated_at = now()
    WHERE id = ${record.id}::uuid AND (transaction_id IS NULL OR transaction_id = ${t.id}) RETURNING *`;
  if (!rows[0])
    throw new PaymentError('The payment reference needs a review by the awards team.', 409);
  return rows[0] as PaymentRecord;
}

export async function claimStatusCheck(id: string) {
  const rows =
    await db()`UPDATE bwa.nomination_payments SET check_after = now() + interval '15 seconds'
    WHERE id = ${id}::uuid AND check_after <= now() RETURNING id`;
  return rows.length > 0;
}

export async function claimDelivery(id: string) {
  const rows = await db()`UPDATE bwa.nomination_payments SET
    email_first_attempt_at = COALESCE(email_first_attempt_at, now()), email_lock_until = now() + interval '60 seconds'
    WHERE id = ${id}::uuid AND state = 'paid' AND email_sent_at IS NULL
    AND (email_lock_until IS NULL OR email_lock_until < now())
    AND (email_first_attempt_at IS NULL OR email_first_attempt_at > now() - interval '23 hours') RETURNING *`;
  return rows[0] as PaymentRecord | undefined;
}

export async function completeDelivery(id: string, emailId: string) {
  await db()`UPDATE bwa.nomination_payments SET email_id = ${emailId}, email_sent_at = now(), email_lock_until = NULL, updated_at = now() WHERE id = ${id}::uuid AND email_sent_at IS NULL`;
}

export async function recoveryCandidates() {
  const config = paymentConfig();
  return (await db()`SELECT * FROM bwa.nomination_payments WHERE
    (state = 'pending' OR (state = 'paid' AND email_sent_at IS NULL)) AND transaction_id IS NOT NULL
    AND app_id = ${config.appId} AND sandbox = ${config.sandbox}
    AND check_after < now() AND created_at > now() - interval '7 days'
    ORDER BY check_after LIMIT 10`) as PaymentRecord[];
}
