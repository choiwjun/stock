import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSignalHealth } from "../src/domain/watchdog.js";
import { makeSignal } from "../src/domain/fixtures.js";

const base = {
  status: "ACTIVE",
  dataStatus: "REALTIME",
  lastHeartbeatAt: "2026-09-18T00:00:29.000Z",
  lastEvaluatedAt: "2026-09-18T00:00:00.000Z",
  staleAfter: "2026-09-18T00:01:00.000Z",
};

test("watchdog keeps healthy stored status and separates freshness", () => {
  const result = evaluateSignalHealth(base, { now: Date.parse("2026-09-18T00:00:30.000Z"), heartbeatTimeoutMs: 5_000, evaluationTimeoutMs: 60_000 });
  assert.equal(result.effectiveStatus, "ACTIVE");
  assert.equal(result.effectiveDataStatus, "REALTIME");
  assert.equal(result.reason, "HEALTHY");
});

test("watchdog suspends a non-terminal signal without changing direction data", () => {
  const result = evaluateSignalHealth({ ...base, lastHeartbeatAt: "2026-09-17T23:50:00.000Z" }, { now: Date.parse("2026-09-18T00:00:30.000Z"), heartbeatTimeoutMs: 5_000, evaluationTimeoutMs: 60_000 });
  assert.equal(result.effectiveStatus, "SUSPENDED");
  assert.equal(result.reason, "ENGINE_HEARTBEAT_STALE");
});

test("watchdog marks stale data independently of terminal status", () => {
  const result = evaluateSignalHealth({ ...base, status: "EXPIRED", dataStatus: "REALTIME", staleAfter: "2026-09-18T00:00:10.000Z" }, { now: Date.parse("2026-09-18T00:00:30.000Z"), heartbeatTimeoutMs: 5_000, evaluationTimeoutMs: 60_000 });
  assert.equal(result.effectiveStatus, "EXPIRED");
  assert.equal(result.effectiveDataStatus, "STALE");
  assert.equal(result.dataFresh, false);
});

test("watchdog fails closed when staleAfter is missing or invalid", () => {
  const result = evaluateSignalHealth({ ...base, staleAfter: "not-a-timestamp" }, { now: Date.parse("2026-09-18T00:00:30.000Z"), heartbeatTimeoutMs: 5_000, evaluationTimeoutMs: 60_000 });
  assert.equal(result.effectiveDataStatus, "UNAVAILABLE");
  assert.equal(result.dataFresh, false);
});

test("fixture signals expose stored and watchdog-derived status separately", () => {
  const signal = makeSignal("005930");
  assert.equal(signal.status, "ACTIVE");
  assert.equal(signal.effectiveStatus, "ACTIVE");
  assert.equal(signal.dataStatus, "REALTIME");
  assert.match(signal.lastHeartbeatAt, /T/);
  assert.match(signal.lastEvaluatedAt, /T/);
});
