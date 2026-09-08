import { createHash, timingSafeEqual } from 'node:crypto';
import { paymentConfig, PaymentError } from './payment-config';

export interface GenieTransaction {
  id: string;
  localId: string;
  amount: number;
  currency: string;
  state: string;
  merchantId: string;
  originatorApp: string;
  url?: string;
}

export function safeCheckoutUrl(value: string | undefined, sandbox: boolean): string | undefined {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.hostname === (sandbox ? 'transaction.uat.geniebiz.lk' : 'transaction.geniebiz.lk')
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function verifyTransaction(
  value: unknown,
  expected: {
    id?: string;
    reference: string;
    amount: number;
    currency: string;
    appId: string;
    merchantId: string;
  }
): GenieTransaction {
  const t = value as GenieTransaction | null;
  if (
    !t ||
    !/^[a-f0-9]{24}$/i.test(t.id) ||
    (expected.id && t.id !== expected.id) ||
    t.localId !== expected.reference ||
    t.amount !== expected.amount ||
    t.currency !== expected.currency ||
    t.originatorApp !== expected.appId ||
    t.merchantId !== expected.merchantId ||
    typeof t.state !== 'string'
  ) {
    throw new PaymentError(
      'The payment could not be verified. Please contact the awards team with your reference.',
      502
    );
  }
  return t;
}

async function request(path: string, body?: unknown): Promise<unknown> {
  const config = paymentConfig();
  let response: Response;
  try {
    response = await fetch(`${config.base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: config.key,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    throw new PaymentError(
      'We are waiting for Genie Business. Check your payment status before trying another payment.',
      502
    );
  }
  if (!response.ok)
    throw new PaymentError(
      'The payment service could not complete this request. Please check the status shortly.',
      502,
      [400, 401, 403, 404, 422].includes(response.status)
    );
  return response.json();
}

export const createTransaction = (body: unknown) => request('/public/v2/transactions', body);
export const getTransaction = (id: string) => {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new PaymentError('Invalid payment reference.', 400);
  return request(`/public/transactions/${id}`);
};

export function validWebhookSignature(headers: Headers): boolean {
  const nonce = headers.get('x-signature-nonce');
  const timestamp = headers.get('x-signature-timestamp');
  const signature = headers.get('x-signature');
  if (
    !nonce ||
    nonce.length > 256 ||
    !timestamp ||
    timestamp.length > 80 ||
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHash('sha256')
    .update(`${nonce}${timestamp}${paymentConfig().key}`)
    .digest();
  // Every replay is rechecked against GET Transaction and idempotent database state.
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
