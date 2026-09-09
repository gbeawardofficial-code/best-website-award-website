import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureLead,
  deliverLead,
  verifiedLead,
  type LeadRecord
} from '../../src/lib/server/nomination-leads';
import * as store from '../../src/lib/server/payment-store';
import * as delivery from '../../src/lib/server/contact-delivery';
import { encryptDetails } from '../../src/lib/server/payment-security';
import type { ContactSubmission } from '../../src/lib/contact';

vi.mock('../../src/lib/server/payment-store');
vi.mock('../../src/lib/server/contact-delivery', async (original) => ({
  ...(await original<typeof import('../../src/lib/server/contact-delivery')>()),
  verifyTurnstile: vi.fn(),
  sendContactEmail: vi.fn()
}));
const query = vi.fn();
const submission: ContactSubmission = {
  submissionId: '4f07dbbb-f612-4f46-96db-cf8823ffc395',
  enquiryType: 'present',
  name: 'Lead Test',
  email: 'lead@example.com',
  organisation: 'Example Studio',
  phone: '+94123456789',
  website: 'https://example.com',
  message: 'Website nomination',
  privacyAccepted: true,
  turnstileToken: 'single-use-token',
  websiteConfirmation: ''
};
let lead: LeadRecord;
beforeEach(() => {
  vi.stubEnv('PAYMENT_DATA_KEY', 'ab'.repeat(32));
  vi.stubEnv(
    'GENIE_API_KEY',
    `eyJ.${Buffer.from(JSON.stringify({ appId: 'app', companyId: 'merchant' })).toString('base64url')}.sig`
  );
  vi.stubEnv('GENIE_APP_ID', 'app');
  vi.stubEnv('GENIE_API_BASE_URL', 'https://api.geniebiz.lk');
  vi.stubEnv('PAYMENT_SITE_URL', 'https://bestwebsiteaward.com');
  lead = {
    id: submission.submissionId,
    owner_hash: 'owner',
    app_id: 'app',
    sandbox: false,
    created_at: new Date().toISOString(),
    email_sent_at: null,
    details: encryptDetails(delivery.deliveryDetails(submission), `lead:${submission.submissionId}`)
  };
  vi.mocked(store.db).mockReturnValue(query as never);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('unpaid nomination leads', () => {
  it('verifies and saves before sending the unpaid email, without starting a payment', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lead])
      .mockResolvedValueOnce([lead])
      .mockResolvedValueOnce([]);
    vi.mocked(delivery.sendContactEmail).mockResolvedValue('lead-email');
    expect(
      await captureLead(submission, 'owner', new Request('https://bestwebsiteaward.com/contact'))
    ).toEqual({ captured: true });
    expect(delivery.verifyTurnstile).toHaveBeenCalledTimes(1);
    expect(delivery.sendContactEmail).toHaveBeenCalledWith(
      delivery.deliveryDetails(submission),
      undefined,
      true
    );
    expect(store.insertPayment).not.toHaveBeenCalled();
  });
  it('does not send another email or consume verification when reopening a saved lead', async () => {
    query.mockResolvedValueOnce([{ ...lead, email_sent_at: new Date().toISOString() }]);
    await captureLead(submission, 'owner', new Request('https://bestwebsiteaward.com/contact'));
    expect(delivery.verifyTurnstile).not.toHaveBeenCalled();
    expect(delivery.sendContactEmail).not.toHaveBeenCalled();
  });
  it('retains a saved lead when email fails so checkout may continue', async () => {
    query.mockResolvedValueOnce([lead]).mockResolvedValueOnce([lead]);
    vi.mocked(delivery.sendContactEmail).mockRejectedValue(new Error('provider timeout'));
    expect(
      await captureLead(submission, 'owner', new Request('https://bestwebsiteaward.com/contact'))
    ).toEqual({ captured: true });
  });
  it('rejects an unverified new lead before saving or emailing', async () => {
    query.mockResolvedValueOnce([]);
    vi.mocked(delivery.verifyTurnstile).mockRejectedValue(new Error('expired'));
    await expect(
      captureLead(submission, 'owner', new Request('https://bestwebsiteaward.com/contact'))
    ).rejects.toThrow('expired');
    expect(query).toHaveBeenCalledTimes(1);
    expect(delivery.sendContactEmail).not.toHaveBeenCalled();
  });
  it('rejects another browser owning the reference', async () => {
    query.mockResolvedValueOnce([lead]);
    await expect(
      captureLead(submission, 'other-owner', new Request('https://bestwebsiteaward.com/contact'))
    ).rejects.toThrow('unavailable');
  });
  it('reuses a verified submission only for exact details in the same browser and environment', async () => {
    query.mockResolvedValue([lead]);
    expect(await verifiedLead(submission, 'owner')).toBe(true);
    expect(await verifiedLead({ ...submission, email: 'different@example.com' }, 'owner')).toBe(
      false
    );
    expect(await verifiedLead(submission, 'another-owner')).toBe(false);
    query.mockResolvedValue([{ ...lead, sandbox: true }]);
    expect(await verifiedLead(submission, 'owner')).toBe(false);
    query.mockResolvedValue([
      { ...lead, created_at: new Date(Date.now() - 31 * 60_000).toISOString() }
    ]);
    expect(await verifiedLead(submission, 'owner')).toBe(false);
  });
  it('does not email when a concurrent delivery owns the lease or payment is confirmed', async () => {
    query.mockResolvedValueOnce([]);
    await deliverLead(lead);
    expect(delivery.sendContactEmail).not.toHaveBeenCalled();
  });
});
