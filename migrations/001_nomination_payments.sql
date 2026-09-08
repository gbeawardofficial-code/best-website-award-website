-- Isolated from all other applications in this database. No existing objects are altered.
CREATE SCHEMA IF NOT EXISTS bwa;
REVOKE ALL ON SCHEMA bwa FROM PUBLIC;
CREATE TABLE IF NOT EXISTS bwa.nomination_payments (
  id uuid PRIMARY KEY,
  owner_hash char(64) NOT NULL,
  details text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL CHECK (currency = 'LKR'),
  terms_version text NOT NULL,
  app_id text NOT NULL,
  merchant_id text NOT NULL,
  sandbox boolean NOT NULL,
  transaction_id text UNIQUE,
  checkout_url text,
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','pending','paid','failed','review')),
  provider_state text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  check_after timestamptz NOT NULL DEFAULT now(),
  email_first_attempt_at timestamptz,
  email_lock_until timestamptz,
  email_id text,
  email_sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS nomination_payments_owner_created_idx ON bwa.nomination_payments(owner_hash, created_at);
CREATE INDEX IF NOT EXISTS nomination_payments_recovery_idx ON bwa.nomination_payments(check_after) WHERE state IN ('creating','pending','paid') AND email_sent_at IS NULL;
REVOKE ALL ON ALL TABLES IN SCHEMA bwa FROM PUBLIC;
