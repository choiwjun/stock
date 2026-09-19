import test from "node:test";
import assert from "node:assert/strict";
import { AuditLog } from "../src/application/audit.js";

test("audit log is bounded, correlated, and excludes sensitive metadata", () => {
  let now = 1_700_000_000_000;
  const audit = new AuditLog({ now: () => now, maxEntries: 2 });
  const first = audit.append({ actorType: "user", actorId: "user-1", action: "AUTH_SESSION_CREATED", resourceType: "session", resourceId: "sess-1", requestId: "req-1", traceId: "trace-1", metadata: { provider: "sandbox", csrfToken: "do-not-store", reason: "ok" } });
  now += 1_000;
  audit.append({ actorType: "system", action: "STREAM_REVOKED", resourceType: "stream", metadata: { reason: "LOGOUT" } });
  audit.append({ actorType: "provider", action: "PAYMENT_WEBHOOK_PROCESSED", resourceType: "payment_event", metadata: { signature: "do-not-store", applied: true } });

  assert.equal(first.requestId, "req-1");
  assert.equal(first.traceId, "trace-1");
  assert.equal("csrfToken" in first.metadata, false);
  assert.equal(audit.snapshot().length, 2);
  assert.equal(audit.snapshot()[0].action, "STREAM_REVOKED");
  assert.match(audit.snapshot()[0].occurredAt, /^2023-/);
});

test("audit log restores a bounded sanitized snapshot", () => {
  const audit = new AuditLog({ maxEntries: 1, now: () => Date.parse("2026-01-01T00:00:00.000Z") });
  audit.append({ actorType: "user", action: "FIRST", resourceType: "test" });
  const snapshot = audit.snapshot();
  const restored = new AuditLog({ maxEntries: 1 });
  const result = restored.restore([{ ...snapshot[0], metadata: { secret: "remove", safe: "keep" } }, { ...snapshot[0], id: "audit_second", metadata: { safe: "keep" } }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "audit_second");
  assert.deepEqual(result[0].metadata, { safe: "keep" });
  assert.throws(() => restored.restore([{ action: "missing-required-fields" }]), { code: "INVALID_AUDIT_SNAPSHOT" });
  assert.throws(() => restored.restore([{ ...snapshot[0], id: "duplicate" }, { ...snapshot[0], id: "duplicate" }]), { code: "INVALID_AUDIT_SNAPSHOT" });
  assert.throws(() => restored.restore([{ ...snapshot[0], metadata: { nested: { unsafe: true } } }]), { code: "INVALID_AUDIT_SNAPSHOT" });
});
