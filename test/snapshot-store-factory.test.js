import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotStore } from "../src/application/snapshot-store-factory.js";
import { SupabaseSnapshotStore } from "../src/application/supabase-snapshot-store.js";

const fakeClient = { from() { throw new Error("not called"); } };

test("snapshot store factory prefers Supabase persistence when server credentials are configured", async () => {
  const store = await createSnapshotStore({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
      SUPABASE_SNAPSHOT_KEY: "factory-test",
    },
    supabaseClient: fakeClient,
  });

  assert.ok(store instanceof SupabaseSnapshotStore);
  assert.equal(store.snapshotKey, "factory-test");
});

test("snapshot store factory falls back to the file adapter without Supabase credentials", async () => {
  const store = await createSnapshotStore({ env: {}, filePath: "/tmp/factory-test.json" });
  assert.equal(store.constructor.name, "FileSnapshotStore");
});
