CREATE TABLE IF NOT EXISTS bwa.winner_resources (
  programme_year smallint NOT NULL CHECK (programme_year >= 2026),
  website_host text NOT NULL CHECK (length(website_host) BETWEEN 3 AND 253),
  website_url text NOT NULL CHECK (website_url ~ '^https?://'),
  award_title text NOT NULL CHECK (length(award_title) BETWEEN 1 AND 160),
  developer_name text CHECK (developer_name IS NULL OR length(trim(developer_name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (programme_year, website_host)
);
CREATE TABLE IF NOT EXISTS bwa.winner_lookup_limits (
  key char(64) PRIMARY KEY,
  hits integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
REVOKE ALL ON bwa.winner_resources, bwa.winner_lookup_limits FROM PUBLIC;
