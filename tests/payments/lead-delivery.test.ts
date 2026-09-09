import { afterEach, expect, it, vi } from 'vitest';
import { sendContactEmail, deliveryDetails } from '../../src/lib/server/contact-delivery';
import type { ContactSubmission } from '../../src/lib/contact';
afterEach(() => vi.restoreAllMocks());
it('labels lead emails as unpaid with all details and a separate idempotency key', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ id: 'email' })));
  const submission = {
    submissionId: 'reference',
    enquiryType: 'present',
    name: 'Test Name',
    email: 'test@example.com',
    organisation: 'Studio',
    phone: '+94123456789',
    website: 'https://example.com',
    message: '<script>unsafe</script>',
    privacyAccepted: true,
    turnstileToken: 'secret-token',
    websiteConfirmation: ''
  } as ContactSubmission;
  await sendContactEmail(deliveryDetails(submission), undefined, true);
  const options = fetchMock.mock.calls[0]![1]!;
  expect(new Headers(options.headers).get('Idempotency-Key')).toBe('bwa-lead-reference');
  const payload = JSON.parse(String(options.body));
  expect(payload.subject).toContain('UNPAID nomination lead');
  for (const value of [
    'Test Name',
    'test@example.com',
    'Studio',
    '+94123456789',
    'https://example.com',
    'reference'
  ])
    expect(payload.text).toContain(value);
  expect(payload.text).toContain('not a confirmed nomination');
  expect(payload.text).toContain('same submission ID');
  expect(payload.html).not.toContain('<script>');
  expect(JSON.stringify(payload)).not.toContain('secret-token');
});
