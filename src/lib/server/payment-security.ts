import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env, PaymentError } from './payment-config';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const newSession = () => randomBytes(32).toString('hex');
export const validSession = (value: string) => /^[a-f0-9]{64}$/.test(value);

function dataKey() {
  const value = env('PAYMENT_DATA_KEY');
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new PaymentError('Payment storage is not configured.');
  return Buffer.from(value, 'hex');
}

export function encryptDetails(value: unknown, reference: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  cipher.setAAD(Buffer.from(reference));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function decryptDetails<T>(value: string, reference: string): T {
  const bytes = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(reference));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()
  );
}
