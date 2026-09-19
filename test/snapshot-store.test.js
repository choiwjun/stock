import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DemoStore } from "../src/application/store.js";
import { FileSnapshotStore } from "../src/application/snapshot-store.js";
import { AuditLog } from "../src/application/audit.js";

test("file snapshot store persists atomically and restores the store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-snapshot-"));
  const path = join(directory, "store.json");
  try {
    const source = new DemoStore();
    source.addWatchlistItem("snapshot-user", "005930", "snapshot-key");
    const snapshotStore = new FileSnapshotStore({ path });
    assert.deepEqual(await snapshotStore.save(source), { saved: true, reason: "SAVED" });

    const restored = new DemoStore();
    assert.deepEqual(await snapshotStore.load(restored), { loaded: true, reason: "LOADED" });
    assert.deepEqual(restored.listWatchlist("snapshot-user").map((item) => item.ticker), ["005930"]);
    const raw = JSON.parse(await readFile(path, "utf8"));
    assert.equal(raw.version, 1);
    assert.equal(raw.watchlists[1][0], "snapshot-user");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file snapshot store persists and restores bounded audit events with the store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-snapshot-"));
  const path = join(directory, "store.json");
  try {
    const source = new DemoStore();
    const sourceAudit = new AuditLog({ now: () => Date.parse("2026-01-01T00:00:00.000Z") });
    sourceAudit.append({ actorType: "user", actorId: "snapshot-user", action: "SNAPSHOT_TEST", resourceType: "test", metadata: { safe: "value" } });
    const snapshotStore = new FileSnapshotStore({ path });
    await snapshotStore.save(source, { auditLog: sourceAudit });

    const restored = new DemoStore();
    const restoredAudit = new AuditLog();
    await snapshotStore.load(restored, { auditLog: restoredAudit });
    assert.equal(restoredAudit.snapshot()[0].action, "SNAPSHOT_TEST");
    assert.equal(restoredAudit.snapshot()[0].actorId, "snapshot-user");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file snapshot store serializes concurrent saves with unique temporary files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-snapshot-"));
  const path = join(directory, "store.json");
  try {
    const source = new DemoStore();
    source.addWatchlistItem("concurrent-user", "005930", "concurrent-key");
    const snapshotStore = new FileSnapshotStore({ path });
    const results = await Promise.all([snapshotStore.save(source), snapshotStore.save(source)]);
    assert.deepEqual(results, [{ saved: true, reason: "SAVED" }, { saved: true, reason: "SAVED" }]);
    const restored = new DemoStore();
    assert.deepEqual(await snapshotStore.load(restored), { loaded: true, reason: "LOADED" });
    assert.deepEqual(restored.listWatchlist("concurrent-user").map((item) => item.ticker), ["005930"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file snapshot store fails closed on malformed state and treats a missing file as empty", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-snapshot-"));
  const path = join(directory, "store.json");
  try {
    const snapshotStore = new FileSnapshotStore({ path });
    assert.deepEqual(await snapshotStore.load(new DemoStore()), { loaded: false, reason: "NOT_FOUND" });
    await writeFile(path, "{not-json", "utf8");
    await assert.rejects(() => snapshotStore.load(new DemoStore()), (error) => error.code === "SNAPSHOT_LOAD_FAILED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file snapshot load validates store and audit state before committing either", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-snapshot-"));
  const path = join(directory, "store.json");
  try {
    const source = new DemoStore();
    source.addWatchlistItem("atomic-file-user", "005930", "atomic-file-key");
    const sourceAudit = new AuditLog();
    sourceAudit.append({ actorType: "system", action: "SOURCE", resourceType: "snapshot" });
    const snapshotStore = new FileSnapshotStore({ path });
    await snapshotStore.save(source, { auditLog: sourceAudit });

    const target = new DemoStore();
    target.addWatchlistItem("existing-user", "000660", "existing-key");
    const targetAudit = new AuditLog();
    targetAudit.append({ actorType: "system", action: "EXISTING", resourceType: "snapshot" });
    const beforeItems = target.listWatchlist("existing-user").map((item) => item.ticker);
    const beforeAudit = targetAudit.snapshot();

    const malformedAudit = JSON.parse(await readFile(path, "utf8"));
    malformedAudit.auditEvents = [{ invalid: true }];
    await writeFile(path, `${JSON.stringify(malformedAudit)}\n`, "utf8");
    await assert.rejects(() => snapshotStore.load(target, { auditLog: targetAudit }), (error) => error.code === "SNAPSHOT_LOAD_FAILED");
    assert.deepEqual(target.listWatchlist("existing-user").map((item) => item.ticker), beforeItems);
    assert.deepEqual(targetAudit.snapshot(), beforeAudit);

    const malformedStore = JSON.parse(await readFile(path, "utf8"));
    malformedStore.auditEvents = beforeAudit;
    malformedStore.watchlists[1][1] = ["not-a-ticker"];
    await writeFile(path, `${JSON.stringify(malformedStore)}\n`, "utf8");
    await assert.rejects(() => snapshotStore.load(target, { auditLog: targetAudit }), (error) => error.code === "SNAPSHOT_LOAD_FAILED");
    assert.deepEqual(target.listWatchlist("existing-user").map((item) => item.ticker), beforeItems);
    assert.deepEqual(targetAudit.snapshot(), beforeAudit);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
