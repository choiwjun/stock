import test from "node:test";
import assert from "node:assert/strict";
import { OutboxQueue } from "../src/application/outbox.js";
import { OutboxWorker } from "../src/application/outbox-worker.js";
import { makeSignal } from "../src/domain/fixtures.js";

test("outbox is idempotent, leases due events, and retries with backoff", () => {
  let now = 10_000;
  const outbox = new OutboxQueue({ now: () => now, retryBaseMs: 100, leaseMs: 50, maxAttempts: 3 });
  const event = { eventId: "evt-1", aggregateType: "signal", aggregateId: "005930", streamKey: "signal:005930:default", payload: { sequence: 1 } };
  assert.equal(outbox.enqueue(event).duplicate, false);
  assert.equal(outbox.enqueue(event).duplicate, true);
  assert.equal(outbox.claimDue().length, 1);
  assert.equal(outbox.claimDue().length, 0);
  outbox.markFailed("evt-1", "temporary");
  assert.equal(outbox.claimDue().length, 0);
  now += 100;
  assert.equal(outbox.claimDue().length, 1);
  outbox.markPublished("evt-1");
  assert.equal(outbox.claimDue().length, 0);
  assert.equal(outbox.get("evt-1").status, "PUBLISHED");
  assert.equal(outbox.get("evt-1").nextAttemptAt, null);
  assert.equal(outbox.get("evt-1").lastError, null);
});

test("outbox rejects the same event id with a different immutable payload", () => {
  const outbox = new OutboxQueue();
  outbox.enqueue({ eventId: "evt-conflict", aggregateType: "signal", aggregateId: "005930", streamKey: "signal:005930:default", payload: { sequence: 1 } });
  assert.throws(() => outbox.enqueue({ eventId: "evt-conflict", aggregateType: "signal", aggregateId: "005930", streamKey: "signal:005930:default", payload: { sequence: 2 } }), (error) => error.code === "OUTBOX_EVENT_CONFLICT");
});

test("outbox worker publishes, checkpoints, and retries failed deliveries", async () => {
  let now = 10_000;
  const queue = new OutboxQueue({ now: () => now, retryBaseMs: 100, leaseMs: 50, maxAttempts: 3 });
  const first = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  const second = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 102 });
  queue.enqueue({ eventId: first.eventId, aggregateType: "signal", aggregateId: "005930", streamKey: first.streamKey, payload: first });
  queue.enqueue({ eventId: second.eventId, aggregateType: "signal", aggregateId: "005930", streamKey: second.streamKey, payload: second });
  let failOnce = true;
  const worker = new OutboxWorker({ queue, consumer: "stream-gateway", publish: async (record) => { if (record.eventId === second.eventId && failOnce) { failOnce = false; throw new Error("gateway unavailable"); } } });
  const firstRun = await worker.runOnce();
  assert.deepEqual({ claimed: firstRun.claimed, published: firstRun.published, failed: firstRun.failed }, { claimed: 1, published: 1, failed: 0 });
  assert.equal(queue.checkpoint("stream-gateway", first.streamKey).sequence, 101);
  const secondRun = await worker.runOnce();
  assert.deepEqual({ claimed: secondRun.claimed, published: secondRun.published, failed: secondRun.failed }, { claimed: 1, published: 0, failed: 1 });
  assert.equal(queue.checkpoint("stream-gateway", second.streamKey).sequence, 101);
  now += 100;
  const thirdRun = await worker.runOnce();
  assert.deepEqual({ claimed: thirdRun.claimed, published: thirdRun.published, failed: thirdRun.failed }, { claimed: 1, published: 1, failed: 0 });
  assert.equal(queue.checkpoint("stream-gateway", second.streamKey).sequence, 102);
  assert.equal(queue.get(second.eventId).status, "PUBLISHED");
});

test("outbox blocks a later cursor until its predecessor is published", () => {
  const queue = new OutboxQueue();
  const first = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  const second = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 102 });
  queue.enqueue({ eventId: first.eventId, aggregateType: "signal", aggregateId: "005930", streamKey: first.streamKey, payload: first });
  queue.enqueue({ eventId: second.eventId, aggregateType: "signal", aggregateId: "005930", streamKey: second.streamKey, payload: second });
  assert.deepEqual(queue.claimDue().map((record) => record.eventId), [first.eventId]);
  queue.markPublished(first.eventId);
  assert.deepEqual(queue.claimDue().map((record) => record.eventId), [second.eventId]);
});

test("outbox worker owns a stoppable background schedule", async () => {
  const queue = new OutboxQueue();
  const event = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  queue.enqueue({ eventId: event.eventId, aggregateType: "signal", aggregateId: "005930", streamKey: event.streamKey, payload: event });
  let published = 0;
  const worker = new OutboxWorker({ queue, consumer: "scheduled-worker", publish: async () => { published += 1; } });
  assert.equal(worker.start(1, 1), true);
  assert.equal(worker.start(1, 1), false);
  await new Promise((resolve) => setTimeout(resolve, 20));
  worker.stop();
  assert.equal(published, 1);
  assert.equal(queue.get(event.eventId).status, "PUBLISHED");
});

test("outbox worker keeps scheduling after a claim failure and exposes an idle barrier", async () => {
  const queue = new OutboxQueue();
  const event = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  queue.enqueue({ eventId: event.eventId, aggregateType: "signal", aggregateId: "005930", streamKey: event.streamKey, payload: event });
  const claimDue = queue.claimDue.bind(queue);
  let failedOnce = true;
  queue.claimDue = (...args) => {
    if (failedOnce) {
      failedOnce = false;
      throw new Error("temporary queue failure");
    }
    return claimDue(...args);
  };
  let observedError = null;
  let published = 0;
  const worker = new OutboxWorker({ queue, consumer: "scheduled-worker", onError: (cause) => { observedError = cause; }, publish: async () => { published += 1; } });
  worker.start(1, 1);
  await new Promise((resolve) => setTimeout(resolve, 30));
  worker.stop();
  await worker.waitForIdle();
  assert.equal(observedError?.message, "temporary queue failure");
  assert.equal(published, 1);
  assert.equal(queue.get(event.eventId).status, "PUBLISHED");
});

test("outbox worker health records delivery failure and recovery", async () => {
  let now = 10_000;
  const queue = new OutboxQueue({ now: () => now, retryBaseMs: 100 });
  const event = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  queue.enqueue({ eventId: event.eventId, aggregateType: "signal", aggregateId: "005930", streamKey: event.streamKey, payload: event });
  let fail = true;
  const worker = new OutboxWorker({ queue, now: () => now, publish: async () => { if (fail) { fail = false; const error = new Error("gateway unavailable"); error.code = "UPSTREAM_UNAVAILABLE"; throw error; } } });
  await worker.runOnce();
  assert.equal(worker.health().consecutiveFailures, 1);
  assert.equal(worker.health().lastErrorCode, "UPSTREAM_UNAVAILABLE");
  now += 100;
  await worker.runOnce();
  assert.equal(worker.health().consecutiveFailures, 0);
  assert.equal(worker.health().lastErrorCode, null);
  assert.equal(worker.health().lastSuccessAt, new Date(now).toISOString());
});

test("outbox checkpoint rejects reverse, duplicate, and cross-stream cursors", () => {
  let now = 100;
  const outbox = new OutboxQueue({ now: () => now });
  const first = { streamKey: "signal:005930:default", epoch: 1, sequence: 10 };
  assert.equal(outbox.advanceCheckpoint("worker-1", first), true);
  assert.equal(outbox.advanceCheckpoint("worker-1", first), false);
  assert.equal(outbox.advanceCheckpoint("worker-1", { ...first, sequence: 9 }), false);
  assert.equal(outbox.advanceCheckpoint("worker-1", { ...first, sequence: 12 }), false);
  assert.equal(outbox.advanceCheckpoint("worker-1", { streamKey: "signal:000660:default", epoch: 1, sequence: 1 }), true);
  assert.deepEqual(outbox.checkpoint("worker-1", first.streamKey).sequence, 10);
});

test("outbox restore rejects malformed delivery state and checkpoint metadata", () => {
  const queue = new OutboxQueue({ maxAttempts: 2 });
  queue.enqueue({ eventId: "restore-event", aggregateType: "signal", aggregateId: "005930", streamKey: "signal:005930:default", payload: { sequence: 1 } });
  const malformedEvent = queue.snapshot();
  malformedEvent.events[0].status = "UNKNOWN";
  assert.throws(() => new OutboxQueue({ maxAttempts: 2 }).restore(malformedEvent), (error) => error.code === "INVALID_OUTBOX_SNAPSHOT");
  const inconsistentPublished = queue.snapshot();
  inconsistentPublished.events[0].status = "PUBLISHED";
  assert.throws(() => new OutboxQueue({ maxAttempts: 2 }).restore(inconsistentPublished), (error) => error.code === "INVALID_OUTBOX_SNAPSHOT");

  queue.advanceCheckpoint("restore-worker", { streamKey: "signal:005930:default", epoch: 1, sequence: 1 });
  const malformedCheckpoint = queue.snapshot();
  malformedCheckpoint.checkpoints[0].updatedAt = "not-a-timestamp";
  assert.throws(() => new OutboxQueue({ maxAttempts: 2 }).restore(malformedCheckpoint), (error) => error.code === "INVALID_OUTBOX_SNAPSHOT");
});

test("outbox checkpoints reject unsafe cursor numbers", () => {
  const outbox = new OutboxQueue();
  assert.equal(outbox.advanceCheckpoint("consumer", { streamKey: "signal:005930:default", epoch: Number.MAX_SAFE_INTEGER + 1, sequence: 1 }), false);
  assert.equal(outbox.advanceCheckpoint("consumer", { streamKey: "signal:005930:default", epoch: 1, sequence: Number.MAX_SAFE_INTEGER + 1 }), false);
});

test("demo store writes a stream event and outbox record once", async () => {
  const { DemoStore } = await import("../src/application/store.js");
  const store = new DemoStore();
  const event = makeSignal("005930", { streamKey: "signal:005930:default", epoch: 1, sequence: 101 });
  store.appendStreamEvent("005930", event);
  store.appendStreamEvent("005930", event);
  assert.equal(store.outbox.snapshot().events.length, 1);
  assert.equal(store.outbox.get(event.eventId).status, "PENDING");
  store.markStreamEventPublished(event.eventId);
  assert.equal(store.outbox.get(event.eventId).status, "PUBLISHED");
});
