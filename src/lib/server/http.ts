import { PaymentError } from './payment-config';
export const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new PaymentError('This request could not be verified.', 403);
}
export async function smallBody(request: Request, limit = 30_000): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > limit)
    throw new PaymentError('The submitted information is too large.', 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new PaymentError('The submitted information is too large.', 413);
      }
      chunks.push(value);
    }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function readForm(request: Request) {
  const bytes = await smallBody(request);
  try {
    return await new Response(bytes as BodyInit, {
      headers: { 'Content-Type': request.headers.get('content-type') || '' }
    }).formData();
  } catch {
    throw new PaymentError('The submitted information could not be read.', 400);
  }
}
export function apiError(error: unknown) {
  if (error instanceof PaymentError)
    return json(error.status, { ok: false, message: error.message });
  console.error('BWA request failed', {
    type: error instanceof Error ? error.name : 'UnknownError'
  });
  return json(503, {
    ok: false,
    message: 'This service is temporarily unavailable. Please try again shortly.'
  });
}
