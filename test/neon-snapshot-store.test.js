import test from "node:test";
import assert from "node:assert/strict";
import { DemoStore } from "../src/application/store.js";
import { NeonSnapshotStore } from "../src/application/neon-snapshot-store.js";
import { AuditLog } from "../src/application/audit.js";

function fakeSql() {
  const rows = new Map();
  const sql = async (strings, ...values) => {
    const statement = strings.join(" ");
    if (statement.includes("SELECT snapshot")) {
      const snapshot = rows.get(values[0]);
      return snapshot ? [{ snapshot }] : [];
    }
    if (statement.includes("INSERT INTO sandbox_snapshots")) {
      rows.set(values[0], JSON.parse(values[1]));
      return [];
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  };
  sql.query = async () => [];
  return sql;
}

test("Neon snapshot store persists and restores sandbox state through the SQL adapter", async () => {
  const sql = fakeSql();
  const source = new DemoStore();
  source.addWatchlistItem("neon-user", "005930", "neon-key");
  const sourceAudit = new AuditLog();
  sourceAudit.append({ actorType: "system", action: "NEON_TEST", resourceType: "snapshot" });
  const snapshotStore = new NeonSnapshotStore({ connectionString: "postgresql://test", snapshotKey: "test", sql });

  assert.deepEqual(await snapshotStore.save(source, { auditLog: sourceAudit }), { saved: true, reason: "SAVED" });
  const restored = new DemoStore();
  const restoredAudit = new AuditLog();
  assert.deepEqual(await snapshotStore.load(restored, { auditLog: restoredAudit }), { loaded: true, reason: "LOADED" });
  assert.deepEqual(restored.listWatchlist("neon-user").map((item) => item.ticker), ["005930"]);
  assert.equal(restoredAudit.snapshot()[0].action, "NEON_TEST");
});

test("Neon snapshot store reports an empty branch without fabricating state", async () => {
  const snapshotStore = new NeonSnapshotStore({ connectionString: "postgresql://test", snapshotKey: "missing", sql: fakeSql() });
  assert.deepEqual(await snapshotStore.load(new DemoStore()), { loaded: false, reason: "NOT_FOUND" });
});
