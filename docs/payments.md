# Nomination payments

Best Website Awards charges a one-time **LKR 2,850** online nomination fee per website. General enquiries remain free. Card details are entered only on Genie Business hosted checkout, never on this website.

## Architecture

- `/contact` renders the form and accessible fee dialog as static HTML.
- `/api/contact` accepts general enquiries and rejects unpaid nominations with HTTP 402.
- `POST /api/nomination/session` creates a seven-day, HttpOnly, SameSite=Lax browser capability cookie.
- `POST /api/nomination/lead` saves encrypted form details and sends an internal unpaid lead email when the payment popup opens. It requires the form's privacy acceptance, the browser session and Turnstile verification. It does not create a payment or confirm a nomination.
- `POST /api/nomination/start` validates the form, fee acceptance and Turnstile, saves encrypted nomination details, then creates one Genie transaction.
- `/nomination-status` is a static, non-indexable page. It checks a session-authorised status API, not URL payment claims.
- `POST /api/nomination/webhook` validates the Genie signature, retrieves the authoritative transaction, and processes confirmed nominations even if the browser has closed.
- `GET /api/nomination/reconcile` is a secret-protected recovery endpoint, called once daily by Vercel Cron and available for manual operations.

An unpaid lead uses the same reference as its later payment. Its email is explicitly labelled `UNPAID nomination lead` and contains the first captured form details. Reopening the popup does not send another email. A later paid confirmation remains a separate email with the matching submission ID. Do not treat an old lead email as evidence that a payment is still unpaid; check for the paid confirmation or join `bwa.nomination_leads.id` to `bwa.nomination_payments.id` for current status.

Lead capture consumes the single-use Turnstile token. Payment start accepts that saved verification only for the exact same details, browser owner and payment environment, within 30 minutes. Changed details or an expired verification require a fresh Turnstile check. Lead emails use a separate durable delivery lease and Resend idempotency key. Temporary email failures do not block checkout after the details have been saved. Daily recovery retries at most five lead deliveries and skips confirmed or review-state payments. As with paid email, an uncertain first attempt older than 23 hours requires manual review to avoid duplicate delivery.

Public pages do not query Neon. Payment APIs use the Neon HTTP driver and short atomic queries, with no database transaction held open during provider requests. Images remain build-time assets. Payment API responses and the status page use `no-store` and `noindex`.

## Credentials and deployment

The dedicated Genie application is **Best Website Awards**, application ID `67df8d31-f4c1-4662-9349-b1bc0648f87e`, domain `https://bestwebsiteaward.com`. It is separate from the GBE portal application. The merchant ID is derived from the server-only application credential and checked against each transaction.

Set the following variables in the **existing GBE-owned Vercel project**, in Production. Do not create or link a different Vercel project.

| Variable                      | Value or purpose                                           |
| ----------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`                | The supplied Neon connection for the isolated `bwa` schema |
| `GENIE_API_BASE_URL`          | `https://api.geniebiz.lk`                                  |
| `GENIE_APP_ID`                | Dedicated BWA application ID above                         |
| `GENIE_API_KEY`               | Dedicated BWA secret, server only                          |
| `PAYMENT_SITE_URL`            | `https://bestwebsiteaward.com`                             |
| `PAYMENT_DATA_KEY`            | Existing local 64-character hex AES key, copied unchanged  |
| `CRON_SECRET`                 | Existing local random secret, at least 32 characters       |
| `NOMINATION_PAYMENTS_ENABLED` | `true` when releasing the verified payment implementation  |
| `PUBLIC_TURNSTILE_SITE_KEY`   | Existing real BWA public site key                          |
| `TURNSTILE_SECRET_KEY`        | Existing real BWA server key, never a testing key          |
| `RESEND_API_KEY`              | Existing Resend key                                        |
| `CONTACT_TO_EMAIL`            | `info@gbeaward.com`                                        |
| `CONTACT_FROM_EMAIL`          | `Best Website Awards <website@access.gbeaward.com>`        |

Keep Preview deployments disabled for payments unless they have a separate UAT environment. Never put production credentials in public-prefixed variables. Do not copy `.env.uat.local` into Vercel Production. Keep the encryption key backed up securely: replacing it makes existing encrypted nomination details unreadable.

The migration is explicit, not part of every build:

```sh
npm run payments:migrate
npm run verify
npm run test:e2e
```

The migration creates only `bwa.nomination_payments`, `bwa.nomination_leads` and their indexes. It does not alter another application’s schema. Run it once against the target database before enabling payments; it is safe to rerun. Existing installations must run it again to add the lead table before releasing lead capture. No new environment variables are required.

After the owner deploys:

1. Confirm the existing production project is Ready and serves `bestwebsiteaward.com`.
2. Ensure Cloudflare does not cache or challenge `/api/nomination/*`. Webhooks must reach the origin without browser challenges. Keep `/nomination-status` uncached as well.
3. Open the nomination form, confirm the Rs. 2,850 popup and the Genie merchant/amount before proceeding.
4. Verify the return page, confirmed server status and nomination email. A real card charge requires the merchant’s authorised tester; do not use UAT cards in Production.
5. Confirm Vercel Cron is present and can authenticate using `CRON_SECRET`. The daily schedule is 03:00 UTC and processes at most ten recovery candidates per invocation.

The per-transaction webhook is sent in each Create Transaction request. Do not replace the merchant’s global webhook or another application’s configuration.

## Recovery and duplicates

| Situation                                          | Behaviour                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double click or repeated start request             | The same nomination reference is reused. A unique database key prevents a second transaction creation.                                                                                       |
| Create Transaction timeout                         | The saved state stays `creating`. No automatic second charge is initiated. A webhook or operator can recover the transaction.                                                                |
| Browser closes after payment                       | The webhook can confirm payment and deliver the saved nomination.                                                                                                                            |
| Redirect says success but payment is pending       | No nomination email is sent until GET Transaction returns `CONFIRMED`.                                                                                                                       |
| Wrong amount, currency, merchant, app or reference | Verification fails without submitting the nomination.                                                                                                                                        |
| Email timeout after payment                        | Paid state remains saved. A short delivery lease and a stable Resend idempotency key protect retries.                                                                                        |
| Email delivery remains uncertain for over 23 hours | Automatic email retry stops before Resend’s 24-hour idempotency window expires. The team must inspect the Resend record to avoid a duplicate email. The nomination and payment remain saved. |
| Failed or cancelled checkout                       | The user can return to the form. A bank debit should be checked with the team before another payment.                                                                                        |
| Refund or void                                     | State becomes `review`; the user is not asked to pay again. Refunds are reviewed and processed by the team in Genie.                                                                         |
| Missing browser cookie                             | Private details are not exposed. The user is directed to contact the team with the reference.                                                                                                |

Status checks poll at most six times, every 15 seconds, and pause while the page is hidden. A shared database check lease prevents multiple tabs from repeatedly querying Genie. Webhooks are the primary completion mechanism; the daily cron is a backstop, not a real-time worker.

To run a recovery batch against the configured production origin:

```sh
npm run payments:reconcile
```

For an ambiguous creation, find the transaction in the Genie dashboard using its `BWA-` customer reference. The following operator command verifies all payment fields before attaching the transaction:

```sh
npm run payments:reconcile -- NOMINATION_UUID GENIE_TRANSACTION_ID
```

The uppercase arguments above are operator inputs, not stored configuration. Never mark a payment as confirmed by manually editing its database state. For an email older than the automatic retry window, inspect Resend using the stable key `bwa-paid-NOMINATION_UUID`. Confirm whether the message was accepted before taking any manual delivery action.

## Testing

`npm run test` covers amount conversion, safe checkout hosts, exact transaction matching, signature validation, encryption, origin checks, body limits, payment-only nomination delivery and email recovery. `npm run test:e2e` covers the dialog, agreement, checkout navigation, confirmation, another submission, delayed email and unavailable service on desktop and mobile. Its network-mocked payment tests never charge a card.

The optional live Neon suite creates and deletes only its own synthetic payment record:

```sh
BWA_DB_TEST=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/payments/database.integration.test.ts
```

Local Genie UAT uses the supplied sandbox credentials in ignored `.env.uat.local` and valid synthetic cards from the supplied UAT document. The isolated test server can run alongside the regular local server:

```sh
ASTRO_DEV_BACKGROUND=1 node --env-file=.env --env-file=.env.uat.local node_modules/astro/bin/astro.mjs dev --ignore-lock --host 127.0.0.1 --port 4326
```

The sandbox uses official Turnstile testing keys only on loopback. Live payments reject those keys. Local testing does not prove that production Cloudflare rules allow incoming webhooks; verify that after deployment.

## Provider references

- [Genie Create Transaction V2](https://geniebusiness.stoplight.io/docs/genie-business-connect/035c753f6dbbe-create-transaction-v2)
- [Genie Get Transaction](https://geniebusiness.stoplight.io/docs/genie-business-connect/20fdbcfec0ca6-get-transaction)
- [Genie webhooks and signature verification](https://geniebusiness.stoplight.io/docs/genie-business-connect/7i6ju3jphgg8d-webhooks)
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Cloudflare Turnstile testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
