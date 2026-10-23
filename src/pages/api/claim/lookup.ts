import type { APIRoute } from 'astro';
import { normaliseWebsite } from '../../../lib/participation/policy';
import { resourcesForWinner } from '../../../lib/content/claim';
import { findWinner, limitWinnerLookups } from '../../../lib/server/winner-store';
import { apiError, json, requireSameOrigin, smallBody } from '../../../lib/server/http';
import { PaymentError } from '../../../lib/server/payment-config';
import { hash } from '../../../lib/server/payment-security';

export const prerender = false;
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      throw new PaymentError('Please submit a website address.', 415);
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(await smallBody(request, 2048)));
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError('The request could not be read.', 400);
    }
    let website: string;
    try {
      const value = (data as { website?: unknown } | null)?.website;
      if (typeof value !== 'string') throw new Error();
      website = normaliseWebsite(value);
    } catch {
      throw new PaymentError('Enter a valid website address.', 400);
    }
    await limitWinnerLookups(hash(`claim:2026:${clientAddress}`));
    const winner = resourcesForWinner(await findWinner(website));
    return json(200, { ok: true, found: !!winner, ...(winner ? { winner } : {}) });
  } catch (error) {
    return apiError(error);
  }
};
export const ALL: APIRoute = () => {
  const response = json(405, { ok: false });
  response.headers.set('Allow', 'POST');
  return response;
};
