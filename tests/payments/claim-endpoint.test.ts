import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../../src/lib/server/winner-store';
import { POST, ALL } from '../../src/pages/api/claim/lookup';
import { PaymentError } from '../../src/lib/server/payment-config';
vi.mock('../../src/lib/server/winner-store', () => ({
  findWinner: vi.fn(),
  limitWinnerLookups: vi.fn()
}));
const approved = {
  programme_year: 2026,
  website_host: 'ceylonenvoy.com',
  website_url: 'https://ceylonenvoy.com/',
  award_title: 'Best Luxury Travel Website',
  developer_name: 'Augmara',
  active: true
};
function context(
  data: unknown,
  origin = 'https://bestwebsiteaward.com',
  type = 'application/json'
) {
  const url = new URL('https://bestwebsiteaward.com/api/claim/lookup');
  return {
    url,
    clientAddress: '192.0.2.1',
    request: new Request(url, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': type },
      body: typeof data === 'string' ? data : JSON.stringify(data)
    })
  } as never;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(store.findWinner).mockResolvedValue(approved);
  vi.mocked(store.limitWinnerLookups).mockResolvedValue(undefined);
});
describe('winner claim HTTP boundary', () => {
  it('looks up only the canonical exact domain and returns approved developer options', async () => {
    const response = await POST(
      context({ website: 'HTTP://WWW.CeylonEnvoy.com/travel?source=email' })
    );
    expect(response.status).toBe(200);
    expect(store.findWinner).toHaveBeenCalledWith('ceylonenvoy.com');
    expect(await response.json()).toMatchObject({
      ok: true,
      found: true,
      winner: {
        website: 'ceylonenvoy.com',
        award: approved.award_title,
        developer: 'Augmara',
        roles: [{ id: 'business' }, { id: 'developer', name: 'Augmara' }]
      }
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });
  it('returns a distinct recoverable non-winner state with no badge links', async () => {
    vi.mocked(store.findWinner).mockResolvedValue(undefined);
    const response = await POST(context({ website: 'another.example.com' }));
    expect(await response.json()).toEqual({ ok: true, found: false });
  });
  it('does not misreport a database failure as an unselected website', async () => {
    vi.mocked(store.findWinner).mockRejectedValue(new Error('database unavailable'));
    const response = await POST(context({ website: 'ceylonenvoy.com' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
  });
  it('fails closed if the DB title and available artwork disagree', async () => {
    vi.mocked(store.findWinner).mockResolvedValue({ ...approved, award_title: 'Different title' });
    expect((await POST(context({ website: 'ceylonenvoy.com' }))).status).toBe(503);
  });
  it.each(['https://evil.example', 'null', ''])(
    'rejects cross-origin requests before reading records (%s)',
    async (origin) => {
      expect((await POST(context({ website: 'ceylonenvoy.com' }, origin))).status).toBe(403);
      expect(store.findWinner).not.toHaveBeenCalled();
    }
  );
  it.each([
    {},
    null,
    { website: 42 },
    { website: 'https://ceylonenvoy.com@evil.example' },
    { website: 'javascript:alert(1)' },
    { website: 'not a domain' }
  ])('rejects invalid website values %j', async (data) => {
    expect((await POST(context(data))).status).toBe(400);
    expect(store.findWinner).not.toHaveBeenCalled();
  });
  it('does not confuse lookalike domains or foreign subdomains with winners', async () => {
    vi.mocked(store.findWinner).mockResolvedValue(undefined);
    for (const website of ['ceylonenvoy.com.evil.example', 'other.ceylonenvoy.com']) {
      const response = await POST(context({ website }));
      expect(await response.json()).toEqual({ ok: true, found: false });
      expect(store.findWinner).toHaveBeenLastCalledWith(website);
    }
  });
  it('enforces request sizes, JSON encoding and method restrictions', async () => {
    expect((await POST(context('x'.repeat(3000)))).status).toBe(413);
    expect((await POST(context('{bad json'))).status).toBe(400);
    expect(
      (await POST(context({ website: 'ceylonenvoy.com' }, undefined, 'text/plain'))).status
    ).toBe(415);
    const response = await ALL({} as never);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
  it('stops before lookup when the rate limit is reached', async () => {
    vi.mocked(store.limitWinnerLookups).mockRejectedValue(new PaymentError('Please wait.', 429));
    expect((await POST(context({ website: 'ceylonenvoy.com' }))).status).toBe(429);
    expect(store.findWinner).not.toHaveBeenCalled();
  });
});
