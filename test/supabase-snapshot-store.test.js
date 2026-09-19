import test from "node:test";
import assert from "node:assert/strict";
import { DemoStore } from "../src/application/store.js";
import { SupabaseSnapshotStore } from "../src/application/supabase-snapshot-store.js";

function fakeClient({ row = null } = {}) {
  const calls = [];
  let stored = row;
  return {
    calls,
    from(table) {
      calls.push({ method: "from", table });
      return {
        select(columns) {
          calls.push({ method: "select", columns });
          return {
            eq(column, value) {
              calls.push({ method: "eq", column, value });
              return {
                async maybeSingle() {
                  calls.push({ method: "maybeSingle" });
                  return { data: stored, error: null };
                },
              };
            },
          };
        },
        async upsert(payload, options) {
          calls.push({ method: "upsert", payload, options });
          stored = payload;
          return { data: null, error: null };
        },
      };
    },
    get stored() {
      return stored;
    },
  };
}

test("Supabase snapshot store saves and restores the sandbox store through the table adapter", async () => {
  const client = fakeClient();
  const source = new DemoStore();
  source.addWatchlistItem("supabase-user", "005930", "supabase-key");
  const snapshotStore = new SupabaseSnapshotStore({ client, snapshotKey: "supabase-test" });

  const saved = await snapshotStore.save(source);
  const restored = new DemoStore();
  const loaded = await snapshotStore.load(restored);

  assert.deepEqual(saved, { saved: true, reason: "SAVED" });
  assert.deepEqual(loaded, { loaded: true, reason: "LOADED" });
  assert.deepEqual(restored.listWatchlist("supabase-user").map((item) => item.ticker), ["005930"]);
  assert.equal(client.calls.at(-1).method, "maybeSingle");
});

test("Supabase snapshot store reports a missing row without fabricating state", async () => {
  const snapshotStore = new SupabaseSnapshotStore({ client: fakeClient(), snapshotKey: "missing" });
  const result = await snapshotStore.load(new DemoStore());
  assert.deepEqual(result, { loaded: false, reason: "NOT_FOUND" });
});

test("Supabase snapshot store uses the server-only PostgREST adapter", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return { ok: true, status: 201, text: async () => "" };
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const snapshotStore = new SupabaseSnapshotStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "server-only-test-key",
    fetchImpl,
    snapshotKey: "rest-test",
  });

  await snapshotStore.save(new DemoStore());
  const loaded = await snapshotStore.load(new DemoStore());

  assert.deepEqual(loaded, { loaded: false, reason: "NOT_FOUND" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.authorization, "Bearer server-only-test-key");
  assert.match(calls[0].url, /\/rest\/v1\/sandbox_snapshots$/);
  assert.match(calls[1].url, /snapshot_key=eq\.rest-test/);
});
