export class PaymentError extends Error {
  constructor(
    message: string,
    public status = 503,
    public definitive = false
  ) {
    super(message);
  }
}

export const env = (name: string): string => process.env[name] || import.meta.env[name] || '';

export function paymentConfig() {
  const base = env('GENIE_API_BASE_URL').replace(/\/$/, '') || 'https://api.geniebiz.lk';
  const key = env('GENIE_API_KEY').trim();
  const appId = env('GENIE_APP_ID').trim();
  const site = env('PAYMENT_SITE_URL').replace(/\/$/, '');
  let merchantId = '';
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString());
    if (claims.appId === appId) merchantId = claims.companyId;
  } catch {
    /* Missing or invalid credentials fail closed below. */
  }
  if (
    !key ||
    !appId ||
    !merchantId ||
    !['https://api.geniebiz.lk', 'https://api.uat.geniebiz.lk'].includes(base)
  ) {
    throw new PaymentError(
      'Card payment is temporarily unavailable. Please contact the awards team.'
    );
  }
  const sandbox = base.includes('.uat.');
  if (!/^https:\/\/[^/?#]+$/.test(site) || (!sandbox && site !== 'https://bestwebsiteaward.com')) {
    throw new PaymentError('The payment return address is not configured.');
  }
  return { base, key, appId, merchantId, site, sandbox };
}

export function assertPaymentEnabled() {
  if (
    env('NOMINATION_PAYMENTS_ENABLED') !== 'true' ||
    !env('DATABASE_URL') ||
    !/^[a-f0-9]{64}$/i.test(env('PAYMENT_DATA_KEY')) ||
    !env('RESEND_API_KEY')
  ) {
    throw new PaymentError(
      'Online nominations are temporarily unavailable. Please try again shortly or contact info@gbeaward.com.'
    );
  }
  const config = paymentConfig();
  if (!config.sandbox && env('TURNSTILE_SECRET_KEY').startsWith('1x000000')) {
    throw new PaymentError('Test verification keys cannot be used for live payments.');
  }
  return config;
}
