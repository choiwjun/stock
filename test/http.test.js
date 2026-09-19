import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createListCursor } from "../src/application/list-cursor.js";

const port = 4300 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;

before(async () => {
  serverProcess = spawn(process.execPath, ["src/app/server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), STREAM_TICK_MS: "25" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server startup timeout")), 5_000);
    const onData = (chunk) => {
      if (chunk.toString().includes(`:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    serverProcess.stdout.on("data", onData);
    serverProcess.once("error", reject);
  });
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill("SIGTERM");
  await once(serverProcess, "exit");
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

function paymentSignature(payload, timestamp = Math.floor(Date.now() / 1_000), secret = "demo-webhook-secret") {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

test("guest receives a direction-free signal preview", async () => {
  const { response, body } = await request("/api/v1/stocks/005930/signals", { headers: { "x-demo-role": "guest" } });
  assert.equal(response.status, 200);
  assert.equal(body.locked, true);
  assert.equal("direction" in body.item, false);
  assert.equal("evidence" in body.item, false);
  assert.equal("history" in body, false);
  assert.equal(body.nextCursor, null);
  assert.equal(body.asOf, body.item.asOf);
  assert.deepEqual(body.items[0], body.item);
});

test("quote API preserves freshness state and provenance metadata", async () => {
  for (const status of ["DELAYED", "STALE", "UNAVAILABLE"]) {
    const { response, body } = await request(`/api/v1/stocks/005930/quote?demoStatus=${status}`);
    assert.equal(response.status, 200);
    assert.equal(body.dataStatus, status);
    assert.equal(typeof body.asOf, "string");
    assert.equal(typeof body.receivedAt, "string");
    assert.equal(typeof body.source, "string");
  }
});

test("requests without a session or explicit demo role fail closed as guests", async () => {
  const flows = await request("/api/v1/stocks/005930/flows");
  assert.equal(flows.response.status, 401);
  assert.equal(flows.body.error.code, "AUTH_REQUIRED");

  const watchlist = await request("/api/v1/watchlists");
  assert.equal(watchlist.response.status, 401);
  assert.equal(watchlist.body.error.code, "AUTH_REQUIRED");

  const metrics = await (await fetch(`${baseUrl}/internal/metrics`)).text();
  assert.match(metrics, /audit_event_total\{action="ACCESS_DENIED",resource_type="authorization"\}/);
});

test("API rejects an untrusted origin and preserves a safe correlation id", async () => {
  const rejected = await request("/api/v1/market/overview", { headers: { origin: "https://attacker.example" } });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.body.error.code, "ORIGIN_REJECTED");

  const accepted = await request("/api/v1/market/overview", { headers: { "x-request-id": "client.req-1" } });
  assert.equal(accepted.body.requestId, "client.req-1");
  assert.equal(accepted.body.traceId, "client.req-1");
  assert.equal(accepted.response.headers.get("x-content-type-options"), "nosniff");

  const metrics = await fetch(`${baseUrl}/internal/metrics`);
  assert.match(await metrics.text(), /http_requests_total\{method="GET",path="\/api\/v1\/market\/overview",status="200"\}/);
});

test("API rejects malformed percent-encoded paths at the routing boundary", async () => {
  const response = await request("/api/v1/stocks/%E0%A4%A/quote");
  assert.equal(response.response.status, 400);
  assert.equal(response.body.error.code, "INVALID_PATH");
});

test("health and metrics endpoints expose operational evidence", async () => {
  const health = await request("/healthz");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, "ok");

  const readiness = await request("/readyz");
  assert.equal(readiness.response.status, 200);
  assert.equal(readiness.body.status, "ready");
  assert.equal(readiness.body.mode, "sandbox");
  assert.equal(readiness.body.checks.outboxWorker.status, "ready");
  assert.equal(readiness.body.checks.authProvider.status, "sandbox");
  assert.equal(readiness.body.checks.marketProvider.status, "sandbox");
  assert.equal(readiness.body.checks.paymentWebhook.status, "sandbox");
  assert.equal(readiness.body.checks.originAllowlist.status, "sandbox");
  assert.equal(readiness.body.checks.metrics.status, "sandbox");

  const metricsResponse = await fetch(`${baseUrl}/internal/metrics`);
  assert.equal(metricsResponse.status, 200);
  assert.match(await metricsResponse.text(), /http_requests_total|stream_replay_total|^$/m);
});

test("API rejects unapproved structured input before mutating state", async () => {
  const screener = await request("/api/v1/screener/query", { method: "POST", headers: { "x-demo-role": "member", "content-type": "application/json" }, body: JSON.stringify({ market: "BUY" }) });
  assert.equal(screener.response.status, 400);
  assert.equal(screener.body.error.code, "VALIDATION_ERROR");

  const checkout = await request("/api/v1/subscriptions/checkout", { method: "POST", headers: { "x-demo-role": "member", "content-type": "application/json", "Idempotency-Key": "invalid-plan-checkout" }, body: JSON.stringify({ plan: "OTHER" }) });
  assert.equal(checkout.response.status, 400);

  const search = await request(`/api/v1/stocks/search?q=${"x".repeat(51)}`);
  assert.equal(search.response.status, 400);
});

test("structured JSON endpoints reject non-JSON content types", async () => {
  const response = await request("/api/v1/screener/query", {
    method: "POST",
    headers: { "x-demo-role": "member", "content-type": "text/plain" },
    body: JSON.stringify({ market: "ALL" }),
  });
  assert.equal(response.response.status, 415);
  assert.equal(response.body.error.code, "UNSUPPORTED_MEDIA_TYPE");
});

test("structured JSON endpoints reject malformed UTF-8 before parsing", async () => {
  const malformedUtf8 = Buffer.from([0x7b, 0x22, 0x6d, 0x61, 0x72, 0x6b, 0x65, 0x74, 0x22, 0x3a, 0xc3, 0x28, 0x7d]);
  const response = await request("/api/v1/screener/query", {
    method: "POST",
    headers: { "x-demo-role": "member", "content-type": "application/json" },
    body: malformedUtf8,
  });
  assert.equal(response.response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("API bounds request bodies before structured parsing", async () => {
  const oversized = JSON.stringify({ market: "ALL", padding: "x".repeat(1_000_001) });
  const response = await request("/api/v1/screener/query", {
    method: "POST",
    headers: { "x-demo-role": "member", "content-type": "application/json" },
    body: oversized,
  });
  assert.equal(response.response.status, 413);
  assert.equal(response.body.error.code, "PAYLOAD_TOO_LARGE");
});

test("list endpoints validate opaque cursor scope and signature", async () => {
  const cursor = createListCursor({ scope: "stocks:search:삼성전자", offset: 0, pageSize: 50 });
  const accepted = await request(`/api/v1/stocks/search?q=${encodeURIComponent("삼성전자")}&cursor=${encodeURIComponent(cursor)}`);
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.body.items[0].ticker, "005930");
  assert.equal(accepted.body.items[0].securityType, "COMMON_STOCK");
  assert.equal(accepted.body.items[0].tradingStatus, "거래 중");

  const rejected = await request(`/api/v1/stocks/search?q=${encodeURIComponent("카카오")}&cursor=${encodeURIComponent(cursor)}`);
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.body.error.code, "INVALID_CURSOR");
});

test("replay endpoint validates cursor scope and returns an explicit fallback state", async () => {
  const { response, body } = await request("/api/v1/stream/replay?streamKey=signal%3A005930%3Adefault&epoch=1&afterSequence=99", { headers: { "x-demo-role": "subscriber", "x-demo-user-id": "replay-user" } });
  assert.equal(response.status, 200);
  assert.equal(body.replayable, false);
  assert.ok(Array.isArray(body.events));
  assert.equal(body.snapshot.item.ticker, "005930");
  assert.equal(body.snapshot.snapshotCursor.sequence, 100);
  assert.equal(body.snapshot.item.direction, "BUY");
});

test("replay endpoint rejects cursor values outside the safe integer range", async () => {
  const response = await request("/api/v1/stream/replay?streamKey=signal%3A005930%3Adefault&epoch=9007199254740992&afterSequence=0", { headers: { "x-demo-role": "subscriber", "x-demo-user-id": "unsafe-cursor-user" } });
  assert.equal(response.response.status, 400);
  assert.equal(response.body.error.code, "INVALID_CURSOR");
});

test("same-ticker streams receive one broadcast event cursor", async () => {
  const [firstResponse, secondResponse] = await Promise.all([
    fetch(`${baseUrl}/api/v1/stream?ticker=000660&role=subscriber&userId=fanout-user-a`),
    fetch(`${baseUrl}/api/v1/stream?ticker=000660&role=subscriber&userId=fanout-user-b`),
  ]);
  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  const firstReader = firstResponse.body.getReader();
  const secondReader = secondResponse.body.getReader();

  async function readChanged(reader) {
    let text = "";
    while (true) {
      const next = await reader.read();
      if (next.done) throw new Error("stream closed before signal.changed");
      text += new TextDecoder().decode(next.value);
      const match = text.match(/event: signal\.changed\nid: [^\n]+\ndata: ([^\n]+)\n\n/);
      if (match) return JSON.parse(match[1]);
    }
  }

  const [firstEvent, secondEvent] = await Promise.all([readChanged(firstReader), readChanged(secondReader)]);
  assert.equal(firstEvent.streamKey, secondEvent.streamKey);
  assert.equal(firstEvent.epoch, secondEvent.epoch);
  assert.equal(firstEvent.sequence, secondEvent.sequence);
  const metrics = await (await fetch(`${baseUrl}/internal/metrics`)).text();
  assert.match(metrics, /stream_event_published_total\{transport="sse"\}/);
  await firstReader.cancel();
  await secondReader.cancel();
});

test("stream gap recovery replays the missing contiguous events", async () => {
  const response = await fetch(`${baseUrl}/api/v1/stream?ticker=068270&demoGap=1&role=subscriber&userId=gap-replay-user`);
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  async function readEvent(eventName) {
    const pattern = new RegExp(`event: ${eventName}\\nid: [^\\n]+\\ndata: ([^\\n]+)\\n\\n`);
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      const match = buffered.match(pattern);
      if (match) return JSON.parse(match[1]);
      const next = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 250)),
      ]);
      if (next.done) break;
      buffered += decoder.decode(next.value);
    }
    throw new Error(`stream event timeout: ${eventName}`);
  }

  const ready = await readEvent("connection\\.ready");
  const changed = await readEvent("signal\\.changed");
  assert.ok(changed.sequence > ready.snapshotCursor.sequence + 1);

  const replay = await request(`/api/v1/stream/replay?streamKey=${encodeURIComponent(ready.streamKey)}&epoch=${ready.snapshotCursor.epoch}&afterSequence=${ready.snapshotCursor.sequence}`, { headers: { "x-demo-role": "subscriber", "x-demo-user-id": "gap-replay-user" } });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.replayable, true);
  assert.equal(replay.body.events[0].sequence, ready.snapshotCursor.sequence + 1);
  assert.ok(replay.body.events.some((event) => event.sequence === changed.sequence));
  await reader.cancel();
});

test("stream reconnect resumes from the supplied cursor before live events", async () => {
  const invalid = await request("/api/v1/stream?ticker=247540&role=subscriber&userId=resume-invalid-user&afterSequence=100");
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_CURSOR");

  const readEventFactory = (reader) => {
    const decoder = new TextDecoder();
    let buffered = "";
    return async (eventName) => {
      const pattern = new RegExp(`event: ${eventName}\\nid: [^\\n]+\\ndata: ([^\\n]+)\\n\\n`);
      const deadline = Date.now() + 1_500;
      while (Date.now() < deadline) {
        const match = buffered.match(pattern);
        if (match) {
          buffered = buffered.slice(match.index + match[0].length);
          return JSON.parse(match[1]);
        }
        const next = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 250)),
        ]);
        if (next.done) break;
        buffered += decoder.decode(next.value);
      }
      throw new Error(`stream event timeout: ${eventName}`);
    };
  };

  const initialResponse = await fetch(`${baseUrl}/api/v1/stream?ticker=247540&role=subscriber&userId=resume-source-user`);
  assert.equal(initialResponse.status, 200);
  const initialReader = initialResponse.body.getReader();
  const readInitial = readEventFactory(initialReader);
  const initialReady = await readInitial("connection\\.ready");
  await readInitial("signal\\.snapshot");
  const firstChanged = await readInitial("signal\\.changed");
  await initialReader.cancel();

  const followerResponse = await fetch(`${baseUrl}/api/v1/stream?ticker=247540&role=subscriber&userId=resume-follower-user`);
  assert.equal(followerResponse.status, 200);
  const followerReader = followerResponse.body.getReader();
  const readFollower = readEventFactory(followerReader);
  await readFollower("connection\\.ready");
  await readFollower("signal\\.snapshot");
  const secondChanged = await readFollower("signal\\.changed");
  const thirdChanged = await readFollower("signal\\.changed");
  assert.equal(secondChanged.sequence, firstChanged.sequence + 1);
  assert.equal(thirdChanged.sequence, firstChanged.sequence + 2);

  const resumeUrl = `/api/v1/stream?ticker=247540&role=subscriber&userId=resume-reconnected-user&streamKey=${encodeURIComponent(initialReady.streamKey)}&epoch=${initialReady.snapshotCursor.epoch}&afterSequence=${firstChanged.sequence}`;
  const resumedResponse = await fetch(`${baseUrl}${resumeUrl}`);
  assert.equal(resumedResponse.status, 200);
  const resumedReader = resumedResponse.body.getReader();
  const readResumed = readEventFactory(resumedReader);
  const resumedReady = await readResumed("connection\\.ready");
  assert.equal(resumedReady.resumed, true);
  assert.equal(resumedReady.snapshotCursor.sequence, firstChanged.sequence);
  const replayed = await readResumed("signal\\.changed");
  assert.equal(replayed.sequence, secondChanged.sequence);
  await resumedReader.cancel();
  await followerReader.cancel();
});

test("watchlist mutation is idempotent at the HTTP boundary", async () => {
  const headers = { "x-demo-role": "member", "content-type": "application/json", "Idempotency-Key": "http-watchlist-1" };
  const first = await request("/api/v1/watchlists", { method: "POST", headers, body: JSON.stringify({ ticker: "000660" }) });
  const replay = await request("/api/v1/watchlists", { method: "POST", headers, body: JSON.stringify({ ticker: "000660" }) });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.created, true);
  assert.deepEqual(
    { watchlistId: replay.body.watchlistId, ticker: replay.body.ticker, created: replay.body.created, duplicate: replay.body.duplicate },
    { watchlistId: first.body.watchlistId, ticker: first.body.ticker, created: first.body.created, duplicate: first.body.duplicate },
  );
  const conflict = await request("/api/v1/watchlists", { method: "POST", headers, body: JSON.stringify({ ticker: "005930" }) });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, "IDEMPOTENCY_CONFLICT");
});

test("security-sensitive transitions expose a low-cardinality audit metric", async () => {
  await request("/api/v1/watchlists", { method: "POST", headers: { "x-demo-role": "member", "content-type": "application/json", "Idempotency-Key": "audit-metric-1" }, body: JSON.stringify({ ticker: "005930" }) });
  const metrics = await (await fetch(`${baseUrl}/internal/metrics`)).text();
  assert.match(metrics, /audit_event_total\{action="WATCHLIST_ITEM_ADDED",resource_type="watchlist_item"\}/);
});

test("watchlist deletion does not reveal or mutate another user's list", async () => {
  const response = await request("/api/v1/watchlists/watchlist-other-user/items/005930", { method: "DELETE", headers: { "x-demo-role": "member", "x-demo-user-id": "owner-user", "Idempotency-Key": "ownership-delete-1" } });
  assert.equal(response.response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
  const metrics = await (await fetch(`${baseUrl}/internal/metrics`)).text();
  assert.match(metrics, /audit_event_total\{action="OWNERSHIP_DENIED",resource_type="watchlist"\}/);
});

test("checkout stays pending until entitlement becomes active", async () => {
  const headers = { "x-demo-role": "member", "content-type": "application/json", "Idempotency-Key": "http-checkout-1" };
  const checkout = await request("/api/v1/subscriptions/checkout", { method: "POST", headers, body: "{}" });
  assert.equal(checkout.response.status, 202);
  assert.equal(checkout.body.subscription.status, "PENDING");

  await new Promise((resolve) => setTimeout(resolve, 1_650));
  const entitlement = await request("/api/v1/entitlements/me", { headers: { "x-demo-role": "member" } });
  assert.equal(entitlement.body.items[0].status, "ACTIVE");

  const signal = await request("/api/v1/stocks/005930/signals", { headers: { "x-demo-role": "member" } });
  assert.equal(signal.body.locked, false);
  assert.equal(signal.body.item.direction, "BUY");
  assert.equal(signal.body.nextCursor, null);
  assert.equal(signal.body.asOf, signal.body.item.asOf);
  assert.deepEqual(signal.body.history.events.map((event) => event.sequence), [100]);
  assert.equal(signal.body.history.revisions[0].revision, 1);
});

test("payment webhook rejects malformed UTF-8 before signature verification", async () => {
  const malformedUtf8 = Buffer.from([0x7b, 0x22, 0x70, 0x72, 0x6f, 0x76, 0x69, 0x64, 0x65, 0x72, 0x22, 0x3a, 0xc3, 0x28, 0x7d]);
  const response = await request("/api/v1/webhooks/payment", {
    method: "POST",
    headers: { "content-type": "application/json", "x-payment-signature": "t=1,v1=invalid" },
    body: malformedUtf8,
  });
  assert.equal(response.response.status, 400);
  assert.equal(response.body.error.code, "WEBHOOK_REJECTED");
});

test("payment webhook verifies signature, deduplicates, and rejects stale revisions", async () => {
  const userHeaders = { "x-demo-role": "member", "x-demo-user-id": "webhook-user", "content-type": "application/json", "Idempotency-Key": "webhook-checkout-1" };
  const checkout = await request("/api/v1/subscriptions/checkout", { method: "POST", headers: userHeaders, body: "{}" });
  assert.equal(checkout.body.subscription.status, "PENDING");

  const payload = JSON.stringify({ provider: "sandbox", providerEventId: "payment-event-1", userId: "webhook-user", revision: 2, eventType: "payment.succeeded" });
  const rejected = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": "sha256=invalid" }, body: payload });
  assert.equal(rejected.response.status, 401);

  const webhookSignature = paymentSignature(payload);
  const webhook = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": webhookSignature }, body: payload });
  assert.equal(webhook.response.status, 200);
  assert.equal(webhook.body.result.applied, true);
  assert.equal(webhook.body.result.status, "ACTIVE");

  const replay = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": webhookSignature }, body: payload });
  assert.equal(replay.body.result.duplicate, true);

  const expiredSignature = paymentSignature(payload, Math.floor(Date.now() / 1_000) - 3_601);
  const expiredSignatureResponse = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": expiredSignature }, body: payload });
  assert.equal(expiredSignatureResponse.response.status, 401);

  const conflictingPayload = JSON.stringify({ ...JSON.parse(payload), userId: "another-user" });
  const conflict = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": paymentSignature(conflictingPayload) }, body: conflictingPayload });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, "PAYMENT_EVENT_CONFLICT");

  const stalePayload = JSON.stringify({ provider: "sandbox", providerEventId: "payment-event-0", userId: "webhook-user", revision: 1, eventType: "payment.failed" });
  const stale = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": paymentSignature(stalePayload) }, body: stalePayload });
  assert.equal(stale.body.result.applied, false);
  assert.equal(stale.body.result.reason, "STALE_PROVIDER_EVENT");
});

test("expired webhook revokes an already-open premium stream", async () => {
  const streamResponse = await fetch(`${baseUrl}/api/v1/stream?ticker=005930&role=subscriber&userId=revoke-user`);
  assert.equal(streamResponse.status, 200);
  const reader = streamResponse.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /connection\.ready/);

  const payload = JSON.stringify({ provider: "sandbox", providerEventId: "expire-event-1", userId: "revoke-user", revision: 1, eventType: "subscription.expired" });
  const webhook = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": paymentSignature(payload) }, body: payload });
  assert.equal(webhook.body.result.status, "EXPIRED");

  let streamText = "";
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline && !streamText.includes("entitlement.revoked")) {
    const next = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 250))]);
    if (next.done) break;
    streamText += new TextDecoder().decode(next.value);
  }
  await reader.cancel();
  assert.match(streamText, /entitlement\.revoked/);
  const metrics = await (await fetch(`${baseUrl}/internal/metrics`)).text();
  assert.match(metrics, /stream_revoke_latency_ms_(count|p95)\{reason="EXPIRED"\}/);
});

test("suspension webhook immediately revokes an already-open premium stream", async () => {
  const streamResponse = await fetch(`${baseUrl}/api/v1/stream?ticker=035420&role=subscriber&userId=suspend-user`);
  assert.equal(streamResponse.status, 200);
  const reader = streamResponse.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /connection\.ready/);

  const payload = JSON.stringify({ provider: "sandbox", providerEventId: "suspend-event-1", userId: "suspend-user", revision: 1, eventType: "subscription.suspended" });
  const webhook = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": paymentSignature(payload) }, body: payload });
  assert.equal(webhook.response.status, 200);
  assert.equal(webhook.body.result.status, "SUSPENDED");

  let streamText = "";
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline && !streamText.includes("entitlement.revoked")) {
    const next = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 250))]);
    if (next.done) break;
    streamText += new TextDecoder().decode(next.value);
  }
  await reader.cancel();
  assert.match(streamText, /entitlement\.revoked/);
  assert.match(streamText, /"reason":"SUSPENDED"/);
});
