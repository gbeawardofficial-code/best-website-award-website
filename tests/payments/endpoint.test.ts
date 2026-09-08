import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, GET } from '../../src/pages/api/nomination/[action]';
import * as genie from '../../src/lib/server/genie';
import * as store from '../../src/lib/server/payment-store';
import * as payments from '../../src/lib/server/payments';
import type { PaymentRecord } from '../../src/lib/server/payment-store';

vi.mock('../../src/lib/server/genie');
vi.mock('../../src/lib/server/payment-store');
vi.mock('../../src/lib/server/payments');
const reference = '4f07dbbb-f612-4f46-96db-cf8823ffc395';
const transactionId = '65c509dcf003980008fbb808';
const record = {
  id: reference,
  state: 'pending',
  transaction_id: transactionId,
  email_sent_at: null
} as PaymentRecord;
const webhook = (body: unknown) =>
  ({
    params: { action: 'webhook' },
    request: new Request('https://bestwebsiteaward.com/api/nomination/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  }) as never;
beforeEach(() => {
  vi.mocked(genie.validWebhookSignature).mockReturnValue(true);
  vi.mocked(store.findPayment).mockResolvedValue(record);
  vi.mocked(store.findPaymentByTransaction).mockResolvedValue(record);
  vi.mocked(payments.verifyPayment).mockResolvedValue(record);
  vi.mocked(payments.deliverPaidNomination).mockResolvedValue(record);
});
afterEach(() => vi.resetAllMocks());

describe('nomination endpoint boundaries', () => {
  it('rejects unsigned callbacks without querying the database or provider', async () => {
    vi.mocked(genie.validWebhookSignature).mockReturnValue(false);
    const response = await POST(webhook({ transactionId, localId: reference }));
    expect(response.status).toBe(401);
    expect(store.findPayment).not.toHaveBeenCalled();
    expect(payments.verifyPayment).not.toHaveBeenCalled();
  });
  it('uses transactionId, not the webhook event id or its untrusted paid claim', async () => {
    const response = await POST(
      webhook({ id: 'event-id', transactionId, localId: reference, state: 'CONFIRMED', amount: 1 })
    );
    expect(response.status).toBe(200);
    expect(payments.verifyPayment).toHaveBeenCalledWith(record, transactionId);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
  it('supports events without a local reference', async () => {
    const response = await POST(webhook({ transactionId }));
    expect(response.status).toBe(200);
    expect(store.findPaymentByTransaction).toHaveBeenCalledWith(transactionId);
  });
  it('recovers ambiguous creation using the authoritative local reference', async () => {
    vi.mocked(store.findPaymentByTransaction).mockResolvedValue(undefined);
    vi.mocked(genie.getTransaction).mockResolvedValue({ localId: reference });
    await POST(webhook({ transactionId }));
    expect(genie.getTransaction).toHaveBeenCalledWith(transactionId);
    expect(payments.verifyPayment).toHaveBeenCalledWith(record, transactionId);
  });
  it('requests a provider retry if the confirmed nomination is still waiting for email', async () => {
    vi.mocked(payments.deliverPaidNomination).mockResolvedValue({ ...record, state: 'paid' });
    expect((await POST(webhook({ transactionId, localId: reference }))).status).toBe(503);
  });
  it('does not expose a nomination to a browser without its secure session', async () => {
    const response = await GET({
      params: { action: 'status' },
      url: new URL(`https://bestwebsiteaward.com/api/nomination/status?reference=${reference}`),
      cookies: { get: () => undefined }
    } as never);
    expect(response.status).toBe(401);
    expect(store.ownedPayment).not.toHaveBeenCalled();
  });
  it('does not let the public run reconciliation', async () => {
    const response = await GET({
      params: { action: 'reconcile' },
      request: new Request('https://bestwebsiteaward.com/api/nomination/reconcile')
    } as never);
    expect(response.status).toBe(401);
    expect(store.recoveryCandidates).not.toHaveBeenCalled();
  });
});
