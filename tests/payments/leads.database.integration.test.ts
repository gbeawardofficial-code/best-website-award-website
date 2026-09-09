import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/lib/server/payment-store';
import { claimLeadDelivery, findLead, deliverLead } from '../../src/lib/server/nomination-leads';
import { encryptDetails } from '../../src/lib/server/payment-security';
import { deliveryDetails } from '../../src/lib/server/contact-delivery';
import type { ContactSubmission } from '../../src/lib/contact';

describe.skipIf(process.env.BWA_DB_TEST !== '1')('live Neon lead delivery guards', () => {
  const id = randomUUID();
  beforeAll(async () => {
    await db()`INSERT INTO bwa.nomination_leads (id,owner_hash,details,app_id,sandbox) VALUES (${id}::uuid,'test-owner','no-personal-data','test-app',true)`;
  });
  afterAll(async () => {
    await db()`DELETE FROM bwa.nomination_leads WHERE id = ${id}::uuid AND app_id = 'test-app'`;
    await db()`DELETE FROM bwa.nomination_payments WHERE id = ${id}::uuid AND app_id = 'test-app'`;
  });
  it('grants only one concurrent delivery lease', async () => {
    const results = await Promise.all([
      claimLeadDelivery(id),
      claimLeadDelivery(id),
      claimLeadDelivery(id)
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it('does not retry beyond the idempotency window', async () => {
    await db()`UPDATE bwa.nomination_leads SET email_lock_until = NULL, email_first_attempt_at = now() - interval '25 hours' WHERE id = ${id}::uuid`;
    expect(await claimLeadDelivery(id)).toBeUndefined();
  });
  it('does not send an unpaid lead after its payment is confirmed', async () => {
    await db()`UPDATE bwa.nomination_leads SET email_first_attempt_at = NULL WHERE id = ${id}::uuid`;
    await db()`INSERT INTO bwa.nomination_payments (id,owner_hash,details,amount,currency,terms_version,app_id,merchant_id,sandbox,state) VALUES (${id}::uuid,'test-owner','test',285000,'LKR','test','test-app','test-merchant',true,'paid')`;
    expect(await claimLeadDelivery(id)).toBeUndefined();
  });
});

it.skipIf(process.env.BWA_LEAD_EMAIL_TEST !== '1')(
  'sends one labelled QA lead through real Resend and records acceptance',
  async () => {
    const id = randomUUID();
    const submission: ContactSubmission = {
      submissionId: id,
      enquiryType: 'present',
      name: 'Codezela QA',
      email: 'info@gbeaward.com',
      organisation: 'Codezela QA (unpaid lead integration test)',
      phone: '',
      website: 'https://bestwebsiteaward.com',
      message:
        'Integration test only. No real entrant, nomination or card charge. Please do not follow up.',
      privacyAccepted: true,
      turnstileToken: 'not-stored',
      websiteConfirmation: ''
    };
    const details = encryptDetails(deliveryDetails(submission), `lead:${id}`);
    try {
      await db()`INSERT INTO bwa.nomination_leads (id,owner_hash,details,app_id,sandbox) VALUES (${id}::uuid,'test-owner',${details},'test-app',true)`;
      await deliverLead((await findLead(id))!);
      expect((await findLead(id))?.email_sent_at).toBeTruthy();
      await deliverLead((await findLead(id))!);
    } finally {
      await db()`DELETE FROM bwa.nomination_leads WHERE id = ${id}::uuid AND app_id = 'test-app'`;
    }
  },
  20_000
);
