import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentRecord } from '../../src/lib/server/payment-store';
import {
  checkPayment,
  deliverPaidNomination,
  paymentView,
  verifyPayment
} from '../../src/lib/server/payments';
import * as store from '../../src/lib/server/payment-store';
import * as genie from '../../src/lib/server/genie';
import * as delivery from '../../src/lib/server/contact-delivery';
import { encryptDetails } from '../../src/lib/server/payment-security';

vi.mock('../../src/lib/server/payment-store');
vi.mock('../../src/lib/server/genie', async (original) => ({
  ...(await original<typeof import('../../src/lib/server/genie')>()),
  getTransaction: vi.fn()
}));
vi.mock('../../src/lib/server/contact-delivery', async (original) => ({
  ...(await original<typeof import('../../src/lib/server/contact-delivery')>()),
  sendContactEmail: vi.fn()
}));

const reference = '4f07dbbb-f612-4f46-96db-cf8823ffc395';
let record: PaymentRecord;
beforeEach(() => {
  vi.stubEnv('PAYMENT_DATA_KEY', 'ab'.repeat(32));
  vi.stubEnv(
    'GENIE_API_KEY',
    `eyJ.${Buffer.from(JSON.stringify({ appId: 'app', companyId: 'merchant' })).toString('base64url')}.signature`
  );
  vi.stubEnv('GENIE_APP_ID', 'app');
  vi.stubEnv('GENIE_API_BASE_URL', 'https://api.geniebiz.lk');
  vi.stubEnv('PAYMENT_SITE_URL', 'https://bestwebsiteaward.com');
  record = {
    id: reference,
    owner_hash: 'owner',
    details: encryptDetails(
      { submission: { submissionId: reference, email: 'entrant@example.com' } },
      reference
    ),
    amount: 285000,
    currency: 'LKR',
    terms_version: '2026-09-09',
    app_id: 'app',
    merchant_id: 'merchant',
    sandbox: false,
    transaction_id: '65c509dcf003980008fbb808',
    checkout_url: 'https://transaction.geniebiz.lk/pay',
    state: 'pending',
    provider_state: 'INITIATED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    paid_at: null,
    check_after: new Date().toISOString(),
    email_first_attempt_at: null,
    email_sent_at: null
  };
  vi.mocked(store.findPayment).mockImplementation(async () => record);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('nomination payment recovery', () => {
  it('does not deliver pending or merely authorised payments', async () => {
    await deliverPaidNomination(record);
    expect(store.claimDelivery).not.toHaveBeenCalled();
    expect(delivery.sendContactEmail).not.toHaveBeenCalled();
  });
  it('shows paid-but-email-pending without asking for another payment', () => {
    const view = paymentView({ ...record, state: 'paid' });
    expect(view.submitted).toBe(false);
    expect(view.checkoutUrl).toBeUndefined();
    expect(view.message).toContain('do not pay again');
  });
  it('does not send the same nomination when another worker owns the delivery lease', async () => {
    record.state = 'paid';
    vi.mocked(store.claimDelivery).mockResolvedValue(undefined);
    await deliverPaidNomination(record);
    expect(delivery.sendContactEmail).not.toHaveBeenCalled();
  });
  it('delivers once and records the provider email id after a confirmed payment', async () => {
    record.state = 'paid';
    vi.mocked(store.claimDelivery).mockResolvedValue(record);
    vi.mocked(delivery.sendContactEmail).mockResolvedValue('resend-id');
    await deliverPaidNomination(record);
    expect(store.completeDelivery).toHaveBeenCalledWith(reference, 'resend-id');
  });
  it('retains paid state when email delivery fails', async () => {
    record.state = 'paid';
    vi.mocked(store.claimDelivery).mockResolvedValue(record);
    vi.mocked(delivery.sendContactEmail).mockRejectedValue(new Error('timeout'));
    const view = await checkPayment(record);
    expect(view.state).toBe('paid');
    expect(view.submitted).toBe(false);
    expect(store.completeDelivery).not.toHaveBeenCalled();
  });
  it('never resends an already delivered nomination', async () => {
    record.state = 'paid';
    record.email_sent_at = new Date().toISOString();
    await deliverPaidNomination(record);
    expect(store.claimDelivery).not.toHaveBeenCalled();
  });
  it('rejects mismatched amounts before changing state or sending email', async () => {
    vi.mocked(genie.getTransaction).mockResolvedValue({
      id: record.transaction_id,
      localId: reference,
      amount: 1,
      currency: 'LKR',
      state: 'CONFIRMED',
      merchantId: 'merchant',
      originatorApp: 'app'
    });
    await expect(verifyPayment(record)).rejects.toThrow('could not be verified');
    expect(store.saveTransaction).not.toHaveBeenCalled();
    expect(delivery.sendContactEmail).not.toHaveBeenCalled();
  });
});
