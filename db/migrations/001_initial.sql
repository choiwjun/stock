-- Stock research platform logical schema.
-- PostgreSQL target. Apply with the repository's expand/migrate/contract process.
-- Provider, retention, RPO/RTO, and security_type policy remain release gates.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE TABLE instruments (
  ticker text PRIMARY KEY CHECK (ticker ~ '^[0-9]{6}$'),
  name text NOT NULL,
  exchange text NOT NULL,
  market_type text NOT NULL,
  security_type text NOT NULL DEFAULT 'COMMON_STOCK' CHECK (security_type = 'COMMON_STOCK'),
  status text NOT NULL DEFAULT 'TRADING' CHECK (status IN ('TRADING', 'HALTED', 'DELISTED')),
  listed_at date,
  delisted_at date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes_current (
  ticker text PRIMARY KEY REFERENCES instruments(ticker),
  price numeric(20, 4) NOT NULL,
  change numeric(20, 4) NOT NULL,
  change_rate numeric(12, 6) NOT NULL,
  volume bigint NOT NULL CHECK (volume >= 0),
  as_of timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  data_status text NOT NULL CHECK (data_status IN ('REALTIME', 'DELAYED', 'STALE', 'UNAVAILABLE')),
  stale_after timestamptz,
  source text NOT NULL,
  CHECK (received_at >= as_of)
);

CREATE TABLE quote_bars (
  ticker text NOT NULL REFERENCES instruments(ticker),
  interval text NOT NULL,
  bucket_at timestamptz NOT NULL,
  open numeric(20, 4) NOT NULL,
  high numeric(20, 4) NOT NULL,
  low numeric(20, 4) NOT NULL,
  close numeric(20, 4) NOT NULL,
  volume bigint NOT NULL CHECK (volume >= 0),
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, interval, bucket_at),
  CHECK (high >= greatest(open, close, low)),
  CHECK (low <= least(open, close, high))
);

CREATE TABLE supply_demand_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL REFERENCES instruments(ticker),
  period text NOT NULL CHECK (period IN ('INTRADAY', '1D', '1W', '1M')),
  as_of timestamptz NOT NULL,
  foreign_net numeric(24, 4) NOT NULL,
  institution_net numeric(24, 4) NOT NULL,
  retail_net numeric(24, 4) NOT NULL,
  volume bigint NOT NULL CHECK (volume >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, period, as_of)
);

CREATE TABLE stock_news (
  news_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  source text NOT NULL,
  url text NOT NULL,
  title text NOT NULL,
  published_at timestamptz NOT NULL,
  content_hash text,
  summary text,
  summary_model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_news_instruments (
  news_id uuid NOT NULL REFERENCES stock_news(news_id) ON DELETE CASCADE,
  ticker text NOT NULL REFERENCES instruments(ticker),
  PRIMARY KEY (news_id, ticker)
);

CREATE TABLE financial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL REFERENCES instruments(ticker),
  period_type text NOT NULL CHECK (period_type IN ('QUARTER', 'YEAR')),
  period_end date NOT NULL,
  revenue numeric(28, 4),
  operating_profit numeric(28, 4),
  net_income numeric(28, 4),
  per numeric(20, 6),
  pbr numeric(20, 6),
  roe numeric(20, 6),
  source text NOT NULL,
  as_of timestamptz NOT NULL,
  UNIQUE (ticker, period_type, period_end, source)
);

CREATE TABLE signals_current (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL REFERENCES instruments(ticker),
  strategy_key text NOT NULL DEFAULT 'default',
  direction text NOT NULL CHECK (direction IN ('BUY', 'SELL', 'NEUTRAL')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED', 'VALIDATING')),
  data_status text NOT NULL CHECK (data_status IN ('REALTIME', 'DELAYED', 'STALE', 'UNAVAILABLE')),
  strength text CHECK (strength IN ('LOW', 'MEDIUM', 'HIGH')),
  occurred_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  valid_until timestamptz,
  last_heartbeat_at timestamptz,
  last_evaluated_at timestamptz,
  stale_after timestamptz,
  health_reason text,
  algorithm_version text NOT NULL,
  last_event_epoch bigint NOT NULL DEFAULT 1,
  last_sequence bigint NOT NULL DEFAULT 0,
  last_event_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, strategy_key),
  UNIQUE (id, ticker, strategy_key),
  CHECK (published_at >= occurred_at),
  CHECK (last_heartbeat_at IS NULL OR last_heartbeat_at >= occurred_at),
  CHECK (last_evaluated_at IS NULL OR last_evaluated_at >= occurred_at),
  CHECK (stale_after IS NULL OR stale_after >= occurred_at)
);

CREATE TABLE signal_events (
  event_id text PRIMARY KEY,
  signal_id uuid NOT NULL,
  ticker text NOT NULL,
  strategy_key text NOT NULL,
  stream_key text NOT NULL,
  epoch bigint NOT NULL CHECK (epoch > 0),
  sequence bigint NOT NULL CHECK (sequence >= 0),
  event_type text NOT NULL,
  payload_jsonb jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_key, epoch, sequence),
  FOREIGN KEY (signal_id, ticker, strategy_key) REFERENCES signals_current(id, ticker, strategy_key),
  CHECK (published_at >= occurred_at)
);

CREATE TABLE signal_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES signals_current(id),
  revision_no bigint NOT NULL CHECK (revision_no > 0),
  input_as_of timestamptz NOT NULL,
  algorithm_version text NOT NULL,
  evaluation_status text NOT NULL,
  evidence_snapshot_jsonb jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_id, revision_no)
);

CREATE TABLE signal_event_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES signal_events(event_id),
  evidence_type text NOT NULL,
  label text NOT NULL,
  value_jsonb jsonb NOT NULL,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0)
);

CREATE TABLE watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE watchlist_items (
  watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  ticker text NOT NULL REFERENCES instruments(ticker),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, ticker)
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL UNIQUE,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL,
  auto_renew_default boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  provider text NOT NULL,
  external_subscription_id text,
  status text NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'CANCELLATION_SCHEDULED', 'REFUND_PENDING', 'REFUNDED', 'PAYMENT_FAILED', 'EXPIRED', 'SUSPENDED')),
  status_revision bigint NOT NULL DEFAULT 0 CHECK (status_revision >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  cancel_at timestamptz,
  refund_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_subscription_id)
);

CREATE TABLE entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  capability text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'REVOKED')),
  effective_from timestamptz,
  effective_until timestamptz,
  source_subscription_id uuid REFERENCES subscriptions(id),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability, revision)
);

CREATE UNIQUE INDEX entitlements_one_active_per_capability
  ON entitlements (user_id, capability) WHERE status = 'ACTIVE';

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  user_id uuid REFERENCES users(id),
  provider_revision bigint,
  payload_hash text NOT NULL,
  signature_valid boolean NOT NULL,
  event_type text NOT NULL,
  processing_status text NOT NULL CHECK (processing_status IN ('RECEIVED', 'APPLIED', 'IGNORED', 'REJECTED', 'FAILED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  rejection_reason text,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_id text NOT NULL UNIQUE,
  stream_key text,
  payload_jsonb jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  next_attempt_at timestamptz,
  leased_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (char_length(last_error) <= 256),
  CHECK (published_at IS NULL OR published_at >= created_at),
  CHECK (
    (status = 'PENDING' AND published_at IS NULL AND next_attempt_at IS NOT NULL)
    OR (status = 'PUBLISHED' AND published_at IS NOT NULL AND next_attempt_at IS NULL AND leased_until IS NULL)
    OR (status = 'FAILED' AND published_at IS NULL AND next_attempt_at IS NULL AND leased_until IS NULL AND last_error IS NOT NULL)
  )
);

CREATE TABLE consumer_checkpoints (
  consumer text NOT NULL,
  stream_key text NOT NULL,
  epoch bigint NOT NULL CHECK (epoch > 0),
  last_sequence bigint NOT NULL CHECK (last_sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, stream_key)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  request_id text,
  trace_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX quotes_current_as_of_idx ON quotes_current (as_of);
CREATE INDEX sessions_active_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX quote_bars_lookup_idx ON quote_bars (ticker, interval, bucket_at DESC);
CREATE INDEX signal_events_lookup_idx ON signal_events (stream_key, epoch, sequence);
CREATE INDEX signal_events_ticker_idx ON signal_events (ticker, occurred_at DESC);
CREATE INDEX signal_revisions_lookup_idx ON signal_revisions (signal_id, revision_no DESC);
CREATE INDEX watchlist_items_position_idx ON watchlist_items (watchlist_id, position);
CREATE INDEX subscriptions_user_status_idx ON subscriptions (user_id, status, ends_at);
CREATE INDEX entitlements_user_capability_idx ON entitlements (user_id, capability, status);
CREATE INDEX stock_news_ticker_idx ON stock_news_instruments (ticker, news_id);
CREATE INDEX financial_snapshots_lookup_idx ON financial_snapshots (ticker, period_end DESC);
CREATE INDEX outbox_pending_idx ON outbox_events (status, next_attempt_at, created_at);
CREATE INDEX outbox_stream_due_idx ON outbox_events (stream_key, status, next_attempt_at, created_at);
CREATE INDEX payment_events_reconciliation_idx ON payment_events (user_id, provider_revision, received_at DESC);
CREATE INDEX audit_events_occurred_idx ON audit_events (occurred_at DESC);
CREATE INDEX audit_events_request_idx ON audit_events (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX audit_events_resource_idx ON audit_events (resource_type, resource_id, occurred_at DESC);
