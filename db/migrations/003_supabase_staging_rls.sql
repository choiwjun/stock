-- Supabase staging hardening for the sandbox snapshot table.
-- The server uses the service role key; no browser role receives snapshot access.
ALTER TABLE sandbox_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sandbox_snapshots FROM anon, authenticated;
