import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("initial migration contains the planning database invariants", async () => {
  const sql = await readFile(new URL("../db/migrations/001_initial.sql", import.meta.url), "utf8");
  for (const table of ["users", "auth_identities", "sessions", "instruments", "quotes_current", "quote_bars", "supply_demand_snapshots", "stock_news", "stock_news_instruments", "financial_snapshots", "signals_current", "signal_events", "signal_event_evidence", "signal_revisions", "watchlists", "watchlist_items", "plans", "subscriptions", "entitlements", "payment_events", "outbox_events", "consumer_checkpoints", "audit_events"]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\s*\\(`), `missing table ${table}`);
  }
  assert.match(sql, /UNIQUE \(stream_key, epoch, sequence\)/);
  assert.match(sql, /UNIQUE \(ticker, strategy_key\)/);
  assert.match(sql, /FOREIGN KEY \(signal_id, ticker, strategy_key\)/);
  for (const column of ["last_heartbeat_at", "last_evaluated_at", "stale_after", "health_reason"]) assert.match(sql, new RegExp(`\\b${column}\\b`), `missing watchdog column ${column}`);
  assert.match(sql, /entitlements_one_active_per_capability/);
  assert.match(sql, /token_hash text NOT NULL UNIQUE/);
  assert.match(sql, /csrf_token_hash text NOT NULL/);
  assert.match(sql, /sessions_active_idx/);
  assert.match(sql, /CREATE TABLE outbox_events/);
  assert.match(sql, /leased_until timestamptz/);
  assert.match(sql, /last_error text/);
  assert.match(sql, /status = 'PUBLISHED'.*published_at IS NOT NULL/s);
  assert.match(sql, /status = 'FAILED'.*last_error IS NOT NULL/s);
  assert.match(sql, /payload_hash text NOT NULL/);
  for (const index of ["outbox_stream_due_idx", "payment_events_reconciliation_idx", "audit_events_occurred_idx", "audit_events_request_idx", "audit_events_resource_idx"]) {
    assert.match(sql, new RegExp(`CREATE INDEX ${index}`), `missing operational index ${index}`);
  }
  assert.doesNotMatch(sql, /access_token|refresh_token|card_number|cvv/i);
});

test("Supabase staging snapshot migration denies browser roles", async () => {
  const sql = await readFile(new URL("../db/migrations/003_supabase_staging_rls.sql", import.meta.url), "utf8");
  assert.match(sql, /ALTER TABLE sandbox_snapshots ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE sandbox_snapshots FROM anon, authenticated/);
});
