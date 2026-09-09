CREATE TABLE IF NOT EXISTS bwa.nomination_leads (
  id uuid PRIMARY KEY,
  owner_hash text NOT NULL,
  details text NOT NULL,
  app_id text NOT NULL,
  sandbox boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  email_first_attempt_at timestamptz,
  email_lock_until timestamptz,
  email_sent_at timestamptz,
  email_id text
);
CREATE INDEX IF NOT EXISTS nomination_leads_owner_created_idx ON bwa.nomination_leads (owner_hash, created_at);
CREATE INDEX IF NOT EXISTS nomination_leads_delivery_idx ON bwa.nomination_leads (created_at) WHERE email_sent_at IS NULL;
REVOKE ALL ON bwa.nomination_leads FROM PUBLIC;
