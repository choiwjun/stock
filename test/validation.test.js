import test from "node:test";
import assert from "node:assert/strict";
import { validateCheckout, validateIdempotencyKey, validatePaymentWebhook, validateScreenerQuery, validateSignalEvent, validateWatchlistMutation } from "../src/application/validation.js";
import { makeSignal } from "../src/domain/fixtures.js";

test("validators accept only approved structured input", () => {
  assert.equal(validateIdempotencyKey("checkout-1234").valueOf(), true);
  assert.equal(validateIdempotencyKey("bad key").valueOf(), false);
  assert.deepEqual(validateScreenerQuery({ market: "KOSPI", priceChange: "UP", volume: "HIGH" }).value, { market: "KOSPI", priceChange: "UP", volume: "HIGH" });
  assert.equal(validateScreenerQuery({ market: "BUY" }).ok, false);
  assert.equal(validateScreenerQuery({ market: "KOSPI", unexpected: true }).ok, false);
  assert.equal(validateCheckout({ plan: "OTHER" }).ok, false);
  assert.equal(validateCheckout({ plan: "ALGORITHM_SIGNAL_MONTHLY", unexpected: true }).ok, false);
  assert.equal(validateWatchlistMutation({ ticker: "005930" }).ok, true);
  assert.equal(validateWatchlistMutation({ ticker: "005930", unexpected: true }).ok, false);
});

test("payment webhook validation requires a known event and monotonic revision shape", () => {
  const valid = validatePaymentWebhook({ provider: "sandbox", providerEventId: "event-1", userId: "user-1", revision: 1, eventType: "payment.succeeded" });
  assert.equal(valid.ok, true);
  assert.equal(validatePaymentWebhook({ ...valid.value, eventType: "subscription.suspended" }).ok, true);
  assert.equal(validatePaymentWebhook({ ...valid.value, eventType: "unknown.event" }).ok, false);
  assert.equal(validatePaymentWebhook({ ...valid.value, revision: 0 }).ok, false);
  assert.equal(validatePaymentWebhook({ ...valid.value, endsAt: "not-a-date" }).ok, false);
  assert.equal(validatePaymentWebhook({ ...valid.value, unexpected: true }).ok, false);
});

test("signal event validation protects cursor scope, time order, status, and evidence shape", () => {
  const valid = makeSignal("005930");
  assert.equal(validateSignalEvent(valid).ok, true);
  assert.equal(validateSignalEvent({ ...valid, streamKey: "signal:000660:default" }).ok, false);
  assert.equal(validateSignalEvent({ ...valid, publishedAt: "2020-01-01T00:00:00.000Z" }).ok, false);
  assert.equal(validateSignalEvent({ ...valid, evidence: [{ type: "BROKEN" }] }).ok, false);
  assert.equal(validateSignalEvent({ ...valid, unexpected: true }).ok, false);
  assert.equal(validateSignalEvent({ ...valid, evidence: [{ ...valid.evidence[0], unexpected: true }] }).ok, false);
  assert.equal(validateSignalEvent({ ...valid, dataStatus: "BUY" }).ok, false);
  assert.equal(validateSignalEvent({ ...valid, sequence: Number.MAX_SAFE_INTEGER + 1 }).ok, false);
  assert.equal(validateSignalEvent({ ...valid, epoch: Number.MAX_SAFE_INTEGER + 1 }).ok, false);
});
