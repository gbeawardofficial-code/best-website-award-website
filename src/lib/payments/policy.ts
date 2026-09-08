// Amounts sent to Genie are minor units, never browser-supplied prices.
export const NOMINATION_AMOUNT = 285_000;
export const NOMINATION_CURRENCY = 'LKR';
export const PAYMENT_TERMS_VERSION = '2026-09-09';
export const validReference = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export type PaymentState = 'creating' | 'pending' | 'paid' | 'failed' | 'review';
export interface PaymentView {
  reference: string;
  state: PaymentState;
  submitted: boolean;
  checkoutUrl?: string;
  message: string;
}

export function paymentState(providerState: string): PaymentState {
  if (providerState === 'CONFIRMED') return 'paid';
  if (['FAILED', 'CANCELLED'].includes(providerState)) return 'failed';
  if (['VOIDED', 'REFUND_REQUESTED', 'REFUNDED'].includes(providerState)) return 'review';
  return 'pending';
}
