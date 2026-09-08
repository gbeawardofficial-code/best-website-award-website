const origin = process.env.PAYMENT_SITE_URL;
const secret = process.env.CRON_SECRET;
if (!origin || !secret) throw new Error('PAYMENT_SITE_URL and CRON_SECRET are required.');
const url = new URL('/api/nomination/reconcile', origin);
const [reference, transaction] = process.argv.slice(2);
if (reference || transaction) {
  if (!reference || !transaction)
    throw new Error('Supply both nomination reference and Genie transaction ID.');
  url.searchParams.set('reference', reference);
  url.searchParams.set('transaction', transaction);
}
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(35_000)
});
console.log('Reconciliation HTTP status:', response.status);
if (!response.ok) process.exitCode = 1;
else console.log(await response.json());
