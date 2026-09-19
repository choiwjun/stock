-- Staging-only persistence for the fixture DemoStore.
-- This table is not a production replacement for the domain tables above.
CREATE TABLE IF NOT EXISTS sandbox_snapshots (
  snapshot_key text PRIMARY KEY,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
