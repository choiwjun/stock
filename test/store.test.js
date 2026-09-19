import test from "node:test";
import assert from "node:assert/strict";
import { DemoStore } from "../src/application/store.js";
import { OutboxWorker } from "../src/application/outbox-worker.js";
import { makeSignal } from "../src/domain/fixtures.js";

test("watchlist mutation is idempotent and duplicate-safe", () => {
  const store = new DemoStore();
  const first = store.addWatchlistItem("user-a", "005930", "key-1");
  const replay = store.addWatchlistItem("user-a", "005930", "key-1");
  const duplicate = store.addWatchlistItem("user-a", "005930", "key-2");

  assert.deepEqual(replay, first);
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(store.listWatchlist("user-a").map((item) => item.ticker), ["005930"]);
});

test("watchlist identifiers and contents are isolated per user", () => {
  const store = new DemoStore();
  const first = store.addWatchlistItem("user-a", "005930", "key-a");
  const second = store.addWatchlistItem("user-b", "000660", "key-b");
  assert.equal(first.watchlistId, "watchlist-user-a");
  assert.equal(second.watchlistId, "watchlist-user-b");
  assert.deepEqual(store.listWatchlist("user-a").map((item) => item.ticker), ["005930"]);
  assert.deepEqual(store.listWatchlist("user-b").map((item) => item.ticker), ["000660"]);
  assert.throws(() => store.addWatchlistItem("user-a", "000660", "key-a"), (error) => error.code === "IDEMPOTENCY_CONFLICT");
});

test("signal current and revision snapshots advance with validated events", () => {
  const store = new DemoStore();
  const initial = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 100 });
  assert.deepEqual(store.seedCurrentSignal("005930", initial), initial);
  assert.equal(store.listSignalRevisions("005930").length, 1);
  const next = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  store.appendStreamEvent("005930", next);
  assert.deepEqual(store.getCurrentSignal("005930"), next);
  const revisions = store.listSignalRevisions("005930");
  assert.equal(revisions.length, 2);
  assert.equal(revisions[1].revision, 2);
  assert.deepEqual(revisions[1].evidenceSnapshot, next.evidence);
  assert.deepEqual(store.listSignalEvents("005930").map((event) => event.sequence), [100, 101]);
  const history = store.listSignalEvents("005930");
  history[0].evidence[0].label = "mutated";
  assert.notEqual(store.listSignalEvents("005930")[0].evidence[0].label, "mutated");
  revisions[1].evidenceSnapshot[0].label = "mutated";
  assert.notEqual(store.listSignalRevisions("005930")[1].evidenceSnapshot[0].label, "mutated");
});

test("sandbox checkout transitions from pending to active", async () => {
  const store = new DemoStore();
  const pending = store.checkout("user-a", "checkout-1");
  assert.equal(pending.status, "PENDING");
  await new Promise((resolve) => setTimeout(resolve, 1_600));
  assert.equal(store.getSubscription("user-a").status, "ACTIVE");
});

test("payment webhook duplicate IDs are idempotent only for the same payload", () => {
  const store = new DemoStore();
  const event = { provider: "sandbox", providerEventId: "event-conflict-1", userId: "user-a", revision: 1, eventType: "payment.succeeded" };
  const first = store.applyPaymentWebhook(event);
  const replay = store.applyPaymentWebhook({ ...event });
  assert.equal(first.applied, true);
  assert.equal(replay.duplicate, true);
  assert.match(store.snapshot().paymentEvents[0][1].fingerprint, /^[a-f0-9]{64}$/);
  assert.equal("event" in store.snapshot().paymentEvents[0][1], false);
  assert.throws(() => store.applyPaymentWebhook({ ...event, userId: "user-b" }), { code: "PAYMENT_EVENT_CONFLICT" });
});

test("payment provider revisions are isolated by provider and user", () => {
  const store = new DemoStore();
  const firstProvider = store.applyPaymentWebhook({ provider: "provider-a", providerEventId: "event-a-1", userId: "same-user", revision: 4, eventType: "payment.succeeded" });
  const secondProvider = store.applyPaymentWebhook({ provider: "provider-b", providerEventId: "event-b-1", userId: "same-user", revision: 1, eventType: "payment.succeeded" });
  assert.equal(firstProvider.applied, true);
  assert.equal(secondProvider.applied, true);
  const stale = store.applyPaymentWebhook({ provider: "provider-a", providerEventId: "event-a-0", userId: "same-user", revision: 3, eventType: "payment.failed" });
  assert.equal(stale.reason, "STALE_PROVIDER_EVENT");
});

test("successful renewal reactivates a cancellation-scheduled subscription", () => {
  const store = new DemoStore();
  const endsAt = new Date(Date.now() + 86_400_000).toISOString();
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "renewal-start", userId: "renewal-user", revision: 1, eventType: "payment.succeeded", endsAt });
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "renewal-cancel", userId: "renewal-user", revision: 2, eventType: "subscription.cancelled", cancelAt: endsAt });
  assert.equal(store.getSubscription("renewal-user").status, "CANCELLATION_SCHEDULED");
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "renewal-success", userId: "renewal-user", revision: 3, eventType: "payment.succeeded", endsAt });
  assert.equal(store.getSubscription("renewal-user").status, "ACTIVE");
  assert.equal(store.getSubscription("renewal-user").autoRenew, true);
});

test("suspended subscription cannot restart through checkout and reactivates through provider success", () => {
  const store = new DemoStore();
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "suspend-start", userId: "suspended-user", revision: 1, eventType: "payment.succeeded" });
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "suspend-event", userId: "suspended-user", revision: 2, eventType: "subscription.suspended" });
  assert.equal(store.getSubscription("suspended-user").status, "SUSPENDED");
  assert.equal(store.checkout("suspended-user", "suspended-checkout").status, "SUSPENDED");

  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "resume-event", userId: "suspended-user", revision: 3, eventType: "payment.succeeded" });
  assert.equal(store.getSubscription("suspended-user").status, "ACTIVE");
  assert.equal(store.getSubscription("suspended-user").autoRenew, true);
});

test("provider lifecycle restores refund-pending subscriptions and expires suspended ones", () => {
  const store = new DemoStore();
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "refund-start", userId: "refund-user", revision: 1, eventType: "payment.succeeded" });
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "refund-pending", userId: "refund-user", revision: 2, eventType: "refund.pending" });
  assert.equal(store.getSubscription("refund-user").status, "REFUND_PENDING");
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "refund-reversed", userId: "refund-user", revision: 3, eventType: "payment.succeeded" });
  assert.equal(store.getSubscription("refund-user").status, "ACTIVE");

  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "suspend-expire-start", userId: "suspend-expire-user", revision: 1, eventType: "payment.succeeded" });
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "suspend-expire-suspend", userId: "suspend-expire-user", revision: 2, eventType: "subscription.suspended" });
  store.applyPaymentWebhook({ provider: "sandbox", providerEventId: "suspend-expire-expired", userId: "suspend-expire-user", revision: 3, eventType: "subscription.expired" });
  assert.equal(store.getSubscription("suspend-expire-user").status, "EXPIRED");
});

test("stream replay returns only a contiguous cursor range", () => {
  const store = new DemoStore();
  store.appendStreamEvent("005930", makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 }));
  store.appendStreamEvent("005930", makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 102 }));

  const replay = store.replayStream("signal:005930:default", 1, 100);
  assert.equal(replay.replayable, true);
  assert.deepEqual(replay.events.map((event) => event.sequence), [101, 102]);
  assert.equal(store.replayStream("signal:005930:default", 1, 99).replayable, false);
});

test("invalid signal events are rejected before stream history or outbox mutation", () => {
  const store = new DemoStore();
  assert.throws(() => store.appendStreamEvent("005930", { eventId: "invalid", streamKey: "signal:000660:default", epoch: 1, sequence: 1 }), (error) => error.code === "INVALID_SIGNAL_EVENT");
  assert.equal(store.replayStream("signal:005930:default", 1, 0).events.length, 0);
  assert.equal(store.outbox.snapshot().events.length, 0);
});

test("stream append rejects scope conflicts, reverse cursors, and cursor collisions", () => {
  const store = new DemoStore();
  const first = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  store.appendStreamEvent("005930", first);
  assert.throws(() => store.appendStreamEvent("005930", makeSignal("000660", { streamKey: "signal:000660:default", epoch: 1, sequence: 102 })), (error) => error.code === "INVALID_SIGNAL_EVENT");
  assert.throws(() => store.appendStreamEvent("005930", makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 100 })), (error) => error.code === "SIGNAL_CURSOR_REVERSE");
  assert.throws(() => store.appendStreamEvent("005930", { ...makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 }), eventId: "sig_evt_005930_collision" }), (error) => error.code === "SIGNAL_CURSOR_CONFLICT");
});

test("late input cannot overwrite the current signal even with a newer cursor", () => {
  const store = new DemoStore();
  const initial = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 100 });
  store.seedCurrentSignal("005930", initial);
  const late = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  const oldAsOf = new Date(Date.parse(initial.asOf) - 1_000).toISOString();
  late.occurredAt = oldAsOf;
  late.asOf = oldAsOf;
  late.publishedAt = new Date(Date.parse(oldAsOf) + 1_000).toISOString();
  assert.throws(() => store.appendStreamEvent("005930", late), (error) => error.code === "SIGNAL_INPUT_REVERSE");
  assert.deepEqual(store.getCurrentSignal("005930"), initial);
  assert.equal(store.listSignalEvents("005930").length, 1);
  assert.equal(store.outbox.snapshot().events.length, 0);
});

test("replay falls back when a retained sequence has an internal gap", () => {
  const store = new DemoStore();
  store.appendStreamEvent("005930", makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 }));
  store.appendStreamEvent("005930", makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 103 }));
  const replay = store.replayStream("signal:005930:default", 1, 100);
  assert.equal(replay.replayable, false);
  assert.equal(replay.resyncReason, "REPLAY_RETENTION_OR_GAP");
  assert.deepEqual(replay.events, []);
});

test("store snapshot restores read models, idempotency, outbox, and checkpoint state", async () => {
  const original = new DemoStore();
  const watchlistResult = original.addWatchlistItem("recovery-user", "005930", "recovery-key");
  const first = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  const second = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 102 });
  original.appendStreamEvent("005930", first);
  original.appendStreamEvent("005930", second);
  const worker = new OutboxWorker({ queue: original.outbox, publish: async () => {} });
  await worker.runOnce(1);

  const snapshot = original.snapshot();
  const recovered = new DemoStore();
  recovered.restore(snapshot);

  assert.deepEqual(recovered.listWatchlist("recovery-user").map((item) => item.ticker), ["005930"]);
  assert.deepEqual(recovered.addWatchlistItem("recovery-user", "005930", "recovery-key"), watchlistResult);
  assert.deepEqual(recovered.getCurrentSignal("005930"), second);
  assert.deepEqual(recovered.listSignalEvents("005930").map((event) => event.sequence), [101, 102]);
  assert.equal(recovered.listSignalRevisions("005930").length, 2);
  assert.equal(recovered.outbox.get(first.eventId).status, "PUBLISHED");
  assert.equal(recovered.outbox.get(second.eventId).status, "PENDING");
  assert.equal(recovered.outbox.checkpoint("outbox-worker", first.streamKey).sequence, 101);

  snapshot.watchlists[0][1].push("000660");
  snapshot.signalCurrent[0][1].direction = "SELL";
  assert.deepEqual(recovered.listWatchlist("recovery-user").map((item) => item.ticker), ["005930"]);
  assert.equal(recovered.getCurrentSignal("005930").direction, second.direction);
  assert.throws(() => recovered.restore({ ...snapshot, version: 2 }), (error) => error.code === "INVALID_STORE_SNAPSHOT");
});

test("store restore rejects malformed nested state without partially replacing the live store", () => {
  const store = new DemoStore();
  store.addWatchlistItem("atomic-restore-user", "005930", "atomic-restore-key");
  store.seedCurrentSignal("005930", makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 100 }));
  const before = store.snapshot();
  const malformed = structuredClone(before);
  malformed.signalCurrent[0][1].sequence = "not-a-sequence";

  assert.throws(() => store.restore(malformed), { code: "INVALID_STORE_SNAPSHOT" });
  assert.deepEqual(store.snapshot(), before);
});
