import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { NOMINATION_AMOUNT, paymentState } from '../../src/lib/payments/policy';
import {
  safeCheckoutUrl,
  validWebhookSignature,
  verifyTransaction,
  getTransaction
} from '../../src/lib/server/genie';
import { encryptDetails, decryptDetails } from '../../src/lib/server/payment-security';
import { requireSameOrigin, smallBody } from '../../src/lib/server/http';
import { nominationContent } from '../../src/data/nomination';

const appId = 'test-app';
const merchantId = 'test-merchant';
const reference = '4f07dbbb-f612-4f46-96db-cf8823ffc395';
const id = '65c509dcf003980008fbb808';
const transaction = {
  id,
  localId: reference,
  amount: NOMINATION_AMOUNT,
  currency: 'LKR',
  state: 'CONFIRMED',
  originatorApp: appId,
  merchantId
};
const expected = { id, reference, amount: NOMINATION_AMOUNT, currency: 'LKR', appId, merchantId };

beforeEach(() => {
  vi.stubEnv(
    'GENIE_API_KEY',
    `eyJ.${Buffer.from(JSON.stringify({ appId, companyId: merchantId })).toString('base64url')}.signature`
  );
  vi.stubEnv('GENIE_APP_ID', appId);
  vi.stubEnv('GENIE_API_BASE_URL', 'https://api.geniebiz.lk');
  vi.stubEnv('PAYMENT_SITE_URL', 'https://bestwebsiteaward.com');
  vi.stubEnv('PAYMENT_DATA_KEY', 'ab'.repeat(32));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('payment trust boundary', () => {
  it('uses LKR minor units and accepts only CONFIRMED as paid', () => {
    expect(NOMINATION_AMOUNT).toBe(285000);
    expect(nominationContent.fee).toBe(`Rs. ${(NOMINATION_AMOUNT / 100).toLocaleString('en-US')}`);
    expect(paymentState('CONFIRMED')).toBe('paid');
    for (const state of ['AUTHORIZED', 'INITIATED', 'QR_CODE_GENERATED', 'UNKNOWN'])
      expect(paymentState(state)).toBe('pending');
    expect(paymentState('REFUNDED')).toBe('review');
    expect(paymentState('CANCELLED')).toBe('failed');
  });
  it.each(['id', 'localId', 'amount', 'currency', 'originatorApp', 'merchantId'])(
    'rejects a mismatched %s',
    (field) => {
      expect(() =>
        verifyTransaction(
          { ...transaction, [field]: field === 'amount' ? 2850 : 'wrong' },
          expected
        )
      ).toThrow();
    }
  );
  it('accepts an exact transaction match', () =>
    expect(verifyTransaction(transaction, expected)).toEqual(transaction));
  it.each([
    'http://transaction.geniebiz.lk/pay',
    'https://transaction.geniebiz.lk.evil.test/pay',
    'https://evil.test',
    'https://user@transaction.geniebiz.lk/pay',
    'https://transaction.geniebiz.lk:444/pay',
    'https://transaction.uat.geniebiz.lk/pay'
  ])('rejects unsafe live checkout URL %s', (url) =>
    expect(safeCheckoutUrl(url, false)).toBeUndefined()
  );
  it('permits the correct hosted checkout', () =>
    expect(safeCheckoutUrl(`https://transaction.geniebiz.lk/${id}`, false)).toBe(
      `https://transaction.geniebiz.lk/${id}`
    ));
  it('checks the documented GET endpoint without sending a Bearer prefix', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(transaction)));
    await getTransaction(id);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.geniebiz.lk/public/transactions/${id}`);
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization
    ).not.toMatch(/^Bearer/);
  });
  it('verifies webhook signatures with a timing-safe hash comparison', () => {
    const headers = new Headers({ 'x-signature-nonce': 'nonce', 'x-signature-timestamp': '12345' });
    expect(validWebhookSignature(headers)).toBe(false);
    headers.set(
      'x-signature',
      createHash('sha256').update(`nonce12345${process.env.GENIE_API_KEY}`).digest('hex')
    );
    expect(validWebhookSignature(headers)).toBe(true);
    headers.set('x-signature', '00'.repeat(32));
    expect(validWebhookSignature(headers)).toBe(false);
  });
  it('encrypts private nomination details and binds ciphertext to its reference', () => {
    const value = { email: 'entrant@example.com', name: 'Entrant' };
    const encrypted = encryptDetails(value, reference);
    expect(encrypted).not.toContain('entrant');
    expect(decryptDetails(encrypted, reference)).toEqual(value);
    expect(() => decryptDetails(encrypted, 'another-reference')).toThrow();
  });
  it('blocks cross-origin and missing-origin mutations', () => {
    for (const origin of [undefined, 'https://evil.test', 'http://bestwebsiteaward.com']) {
      expect(() =>
        requireSameOrigin(
          new Request('https://bestwebsiteaward.com/api/nomination/start', {
            headers: origin ? { origin } : {}
          })
        )
      ).toThrow();
    }
    expect(() =>
      requireSameOrigin(
        new Request('https://bestwebsiteaward.com/api/nomination/start', {
          headers: { origin: 'https://bestwebsiteaward.com' }
        })
      )
    ).not.toThrow();
  });
  it('enforces the body limit even without content-length', async () => {
    const request = new Request('https://bestwebsiteaward.com/api/contact', {
      method: 'POST',
      body: 'a'.repeat(30001)
    });
    await expect(smallBody(request)).rejects.toThrow('too large');
  });
});
