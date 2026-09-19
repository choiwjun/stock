import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { TextDecoder } from "node:util";
import { DemoStore, getDemoRole, getDemoUserId } from "../application/store.js";
import { AuditLog } from "../application/audit.js";
import { OutboxWorker } from "../application/outbox-worker.js";
import { paginateList } from "../application/list-cursor.js";
import { FixedWindowRateLimiter, isAllowedOrigin, normalizeOrigin, normalizeRequestId, securityHeaders } from "../application/security.js";
import { SESSION_TTL_MS, SessionStore, parseCookies, serializeSessionCookie, sessionCookieName } from "../application/session.js";
import { MetricsRegistry } from "../application/metrics.js";
import { createMarketProvider } from "../application/market-provider.js";
import { createSnapshotStore } from "../application/snapshot-store-factory.js";
import { validateCheckout, validateDemoSession, validateIdempotencyKey, validatePaymentWebhook, validateScreenerQuery, validateSearchQuery, validateWatchlistMutation } from "../application/validation.js";
import { ENTITLEMENT } from "../domain/constants.js";
import { entitlementForSubscription, shouldRevokeEntitlement } from "../domain/subscription.js";
import { makeConditions, makeSignal, makeSignalPreview } from "../domain/fixtures.js";

const ROOT_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PUBLIC_DIR = join(ROOT_DIR, "public");
const PORT = Number(process.env.PORT || 4173);
const PRODUCTION = process.env.NODE_ENV === "production";
const metricsTokenConfigured = typeof process.env.INTERNAL_METRICS_TOKEN === "string" && process.env.INTERNAL_METRICS_TOKEN.trim().length > 0;
const configuredPaymentWebhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || "";
const paymentWebhookConfigured = Boolean(configuredPaymentWebhookSecret) && (!PRODUCTION || configuredPaymentWebhookSecret !== "demo-webhook-secret");
const PAYMENT_WEBHOOK_SECRET = configuredPaymentWebhookSecret || "demo-webhook-secret";
const configuredPaymentSignatureToleranceSeconds = Number(process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS || 300);
const PAYMENT_SIGNATURE_TOLERANCE_MS = Number.isInteger(configuredPaymentSignatureToleranceSeconds) && configuredPaymentSignatureToleranceSeconds >= 1 && configuredPaymentSignatureToleranceSeconds <= 3_600
  ? configuredPaymentSignatureToleranceSeconds * 1_000
  : 300_000;
const configuredStreamTickMs = Number(process.env.STREAM_TICK_MS || 6_000);
const STREAM_TICK_MS = Number.isFinite(configuredStreamTickMs) && configuredStreamTickMs > 0 ? configuredStreamTickMs : 6_000;
const configuredOutboxWorkerIntervalMs = Number(process.env.OUTBOX_WORKER_INTERVAL_MS || 1_000);
const OUTBOX_WORKER_INTERVAL_MS = Number.isFinite(configuredOutboxWorkerIntervalMs) && configuredOutboxWorkerIntervalMs > 0 ? configuredOutboxWorkerIntervalMs : 1_000;
const configuredAuthRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const AUTH_RATE_LIMIT_MAX = Number.isInteger(configuredAuthRateLimitMax) && configuredAuthRateLimitMax > 0 ? configuredAuthRateLimitMax : 10;
const configuredSessionTtlMs = Number(process.env.SESSION_TTL_MS || SESSION_TTL_MS);
const SESSION_TTL = Number.isInteger(configuredSessionTtlMs) && configuredSessionTtlMs > 0 ? configuredSessionTtlMs : SESSION_TTL_MS;
const MAX_REQUEST_BODY_BYTES = 1_000_000;
const LIST_PAGE_SIZE = 50;
const OUTBOX_ERROR_REASONS = new Set(["UPSTREAM_UNAVAILABLE", "CHECKPOINT_NOT_CONTIGUOUS", "OUTBOX_CURSOR_CONFLICT", "PUBLISH_FAILED", "WORKER_ERROR"]);
const RATE_LIMITER = new FixedWindowRateLimiter({ windowMs: 60_000, max: 240 });
const AUTH_RATE_LIMITER = new FixedWindowRateLimiter({ windowMs: 60_000, max: AUTH_RATE_LIMIT_MAX });
const METRICS = new MetricsRegistry();
const AUDIT = new AuditLog();
const store = new DemoStore();
const sessions = new SessionStore({ ttlMs: SESSION_TTL });
const marketProvider = createMarketProvider({ kind: process.env.MARKET_PROVIDER || "fixture" });
const openStreams = new Set();
const streamTimers = new Map();
const streamOutboxWorker = new OutboxWorker({
  queue: store.outbox,
  consumer: "sse-gateway",
  onError: (cause, record) => {
    const reason = OUTBOX_ERROR_REASONS.has(cause?.code) ? cause.code : (record ? "PUBLISH_FAILED" : "WORKER_ERROR");
    METRICS.increment("outbox_worker_error_total", { kind: record ? "delivery" : "worker", reason });
  },
  publish: async (record) => {
    const ticker = record.streamKey?.match(/^signal:(\d{6}):default$/)?.[1];
    if (!ticker) return;
    const clients = [...openStreams].filter((client) => client.ticker === ticker && !client.closed);
    for (const client of clients) {
      if (!hasActiveSignalEntitlement(client.request)) {
        revokeStreamsForUser(client.userId, "ENTITLEMENT_INACTIVE");
        continue;
      }
      if (client.demoGapPending) {
        client.demoGapPending = false;
        continue;
      }
      sendSse(client.res, "signal.changed", record.payload, record.eventId);
    }
    METRICS.increment("stream_event_published_total", { transport: "sse" });
  },
});
const configuredOrigin = process.env.APP_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (PRODUCTION ? "" : `http://localhost:${PORT}`));
const normalizedOrigin = normalizeOrigin(configuredOrigin);
const originAllowlistConfigured = Boolean(normalizedOrigin);
const allowedOrigins = PRODUCTION
  ? new Set(normalizedOrigin ? [normalizedOrigin] : [])
  : new Set([normalizedOrigin, normalizeOrigin(`http://localhost:${PORT}`), normalizeOrigin(`http://127.0.0.1:${PORT}`)].filter(Boolean));
const snapshotStore = await createSnapshotStore();
const loadedSnapshot = await snapshotStore.load(store, { auditLog: AUDIT });
if (loadedSnapshot.loaded) console.log("Loaded sandbox store snapshot");

let snapshotWriteChain = Promise.resolve();
function persistSnapshot() {
  const operation = snapshotWriteChain.then(
    () => snapshotStore.save(store, { auditLog: AUDIT }),
    () => snapshotStore.save(store, { auditLog: AUDIT }),
  );
  snapshotWriteChain = operation.then(() => undefined, () => undefined);
  return operation;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function requestId(request) {
  const generated = `req_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  return normalizeRequestId(request.headers["x-request-id"], generated);
}

function json(res, status, body, id, extraHeaders = {}) {
  const payload = JSON.stringify({ ...body, requestId: id, traceId: id });
  res.writeHead(status, { ...securityHeaders({ production: PRODUCTION }), "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": id, "x-trace-id": id, ...extraHeaders });
  res.end(payload);
}

function error(res, status, code, message, id, details = undefined) {
  json(res, status, { error: { code, message, ...(details ? { details } : {}) } }, id);
}

function readiness() {
  const outboxHealth = streamOutboxWorker.health();
  const checks = {
    outboxWorker: { status: outboxHealth.active ? "ready" : "not_ready", ...outboxHealth },
    authProvider: {
      status: PRODUCTION ? "not_ready" : "sandbox",
      kind: "sandbox",
    },
    marketProvider: {
      status: marketProvider.kind === "fixture" ? (PRODUCTION ? "not_ready" : "sandbox") : "ready",
      kind: marketProvider.kind,
    },
    paymentWebhook: {
      status: PRODUCTION ? "not_ready" : "sandbox",
      configured: Boolean(configuredPaymentWebhookSecret),
    },
    originAllowlist: {
      status: originAllowlistConfigured ? (PRODUCTION ? "ready" : "sandbox") : "not_ready",
      configured: originAllowlistConfigured,
    },
    metrics: {
      status: metricsTokenConfigured ? (PRODUCTION ? "ready" : "sandbox") : (PRODUCTION ? "not_ready" : "sandbox"),
      configured: metricsTokenConfigured,
    },
    persistence: {
      status: snapshotStore.enabled ? "ready" : (PRODUCTION ? "not_ready" : "sandbox"),
      kind: snapshotStore.kind,
    },
  };
  const reasons = [];
  if (!streamOutboxWorker.active) reasons.push("OUTBOX_WORKER_STOPPED");
  if (PRODUCTION) reasons.push("AUTH_PROVIDER_SANDBOX");
  if (PRODUCTION && marketProvider.kind === "fixture") reasons.push("MARKET_PROVIDER_SANDBOX");
  if (PRODUCTION) reasons.push(paymentWebhookConfigured ? "PAYMENT_PROVIDER_SANDBOX" : "PAYMENT_WEBHOOK_NOT_CONFIGURED");
  if (PRODUCTION && !originAllowlistConfigured) reasons.push("ORIGIN_NOT_CONFIGURED");
  if (PRODUCTION && !metricsTokenConfigured) reasons.push("METRICS_NOT_CONFIGURED");
  if (PRODUCTION && !snapshotStore.enabled) reasons.push("PERSISTENCE_NOT_CONFIGURED");
  return {
    status: reasons.length === 0 ? "ready" : "not_ready",
    mode: PRODUCTION ? "production" : "sandbox",
    checks,
    ...(reasons.length ? { reasons } : {}),
  };
}

function roleContext(request) {
  const session = sessions.getFromRequest(request, { production: PRODUCTION });
  if (session) return { role: session.role, userId: session.userId, session };
  const hasSessionCookie = Boolean(parseCookies(request.headers?.cookie || "").get(sessionCookieName({ production: PRODUCTION })));
  if (PRODUCTION || hasSessionCookie) return { role: "guest", userId: "anonymous" };
  return { role: getDemoRole(request), userId: getDemoUserId(request) };
}

function currentSession(request) {
  return sessions.getFromRequest(request, { production: PRODUCTION });
}

function recordAudit(request, id, { action, resourceType, resourceId = null, actorType = "user", actorId = undefined, metadata = {} }) {
  const context = roleContext(request);
  const event = AUDIT.append({
    actorType,
    actorId: actorId === undefined ? (context.role === "guest" ? null : context.userId) : actorId,
    action,
    resourceType,
    resourceId,
    requestId: id,
    traceId: id,
    metadata,
  });
  METRICS.increment("audit_event_total", { action, resource_type: resourceType });
  return event;
}

function requireCsrf(request, res, id) {
  const session = currentSession(request);
  if (!session || sessions.verifyCsrf(request, session)) return true;
  recordAudit(request, id, { action: "CSRF_REJECTED", resourceType: "mutation", resourceId: new URL(request.url, "http://localhost").pathname, metadata: { method: request.method || "UNKNOWN" } });
  error(res, 403, "CSRF_REQUIRED", "세션 요청에는 유효한 CSRF 토큰이 필요합니다.", id);
  return false;
}

function hasActiveSignalEntitlement(request) {
  const { role, userId } = roleContext(request);
  if (role === "guest") return false;
  const subscription = store.getSubscription(userId, role);
  return entitlementForSubscription(subscription).status === "ACTIVE";
}

function requireAccess(request, res, id, minimum) {
  const { role } = roleContext(request);
  const resourceId = new URL(request.url, "http://localhost").pathname;
  if (minimum === "member" && role === "guest") {
    recordAudit(request, id, { action: "ACCESS_DENIED", resourceType: "authorization", resourceId, metadata: { required: minimum, reason: "AUTH_REQUIRED" } });
    error(res, 401, "AUTH_REQUIRED", "이 기능은 로그인이 필요합니다.", id);
    return false;
  }
  if (minimum === "subscriber" && !hasActiveSignalEntitlement(request)) {
    const reason = role === "guest" ? "AUTH_REQUIRED" : "ENTITLEMENT_REQUIRED";
    recordAudit(request, id, { action: "ACCESS_DENIED", resourceType: "authorization", resourceId, metadata: { required: minimum, reason } });
    error(res, role === "guest" ? 401 : 403, reason, role === "guest" ? "로그인 후 구독 권한을 확인할 수 있습니다." : "이 기능은 활성 구독 권한이 필요합니다.", id, { requiredEntitlement: ENTITLEMENT });
    return false;
  }
  return true;
}

function validateTicker(ticker, res, id) {
  if (!marketProvider.getStock(ticker)) {
    error(res, 404, "NOT_FOUND", "종목을 찾을 수 없습니다.", id);
    return false;
  }
  return true;
}

function validateWatchlistOwnership(request, watchlistId, res, id) {
  const expected = `watchlist-${roleContext(request).userId}`;
  if (watchlistId !== expected) {
    recordAudit(request, id, { action: "OWNERSHIP_DENIED", resourceType: "watchlist", resourceId: watchlistId, metadata: { operation: "delete_item" } });
    error(res, 404, "NOT_FOUND", "관심목록을 찾을 수 없습니다.", id);
    return false;
  }
  return true;
}

function pageList(items, cursor, scope, res, id) {
  try {
    return paginateList(items, { cursor, scope, pageSize: LIST_PAGE_SIZE });
  } catch (cause) {
    if (cause.code === "INVALID_CURSOR") {
      error(res, 400, "INVALID_CURSOR", "목록 cursor가 올바르지 않거나 다른 조회 조건에 사용되었습니다.", id);
      return null;
    }
    throw cause;
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const rejectOnce = (cause) => {
      if (settled) return;
      settled = true;
      reject(cause);
    };
    request.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bytes += buffer.length;
      if (bytes > MAX_REQUEST_BODY_BYTES) {
        const error = new Error("BODY_TOO_LARGE");
        error.code = "BODY_TOO_LARGE";
        rejectOnce(error);
        request.resume();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      if (!settled) {
        try {
          const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
          settled = true;
          resolve(decoded);
        } catch {
          const error = new Error("INVALID_ENCODING");
          error.code = "INVALID_ENCODING";
          rejectOnce(error);
        }
      }
    });
    request.on("error", rejectOnce);
    const declaredLength = Number(request.headers["content-length"]);
    if (Number.isSafeInteger(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
      const error = new Error("BODY_TOO_LARGE");
      error.code = "BODY_TOO_LARGE";
      rejectOnce(error);
      request.resume();
    }
  });
}

function requireJsonContentType(request, res, id) {
  const contentType = request.headers["content-type"];
  if (typeof contentType === "string" && /^application\/json(?:\s*;|\s*$)/i.test(contentType.trim())) return true;
  recordAudit(request, id, { action: "CONTENT_TYPE_REJECTED", resourceType: "request", resourceId: new URL(request.url, "http://localhost").pathname, actorType: "system", actorId: "edge" });
  error(res, 415, "UNSUPPORTED_MEDIA_TYPE", "JSON 요청에는 application/json Content-Type이 필요합니다.", id);
  return false;
}

function parseJsonBody(request) {
  return readRequestBody(request).then((raw) => {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      const error = new Error("INVALID_JSON");
      error.code = "INVALID_JSON";
      throw error;
    }
  });
}

function parseRawBody(request) {
  return readRequestBody(request);
}

function hasValidPaymentSignature(request, rawBody, now = Date.now()) {
  const provided = request.headers["x-payment-signature"] || "";
  if (typeof provided !== "string") return false;
  const match = /^t=(\d{1,12}),v1=([a-f0-9]{64})$/.exec(provided);
  if (!match) return false;
  const timestamp = Number(match[1]) * 1_000;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > PAYMENT_SIGNATURE_TOLERANCE_MS) return false;
  const expected = createHmac("sha256", PAYMENT_WEBHOOK_SECRET).update(`${match[1]}.${rawBody}`).digest("hex");
  const providedBuffer = Buffer.from(match[2], "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function idempotencyKey(request) {
  return request.headers["idempotency-key"];
}

function authRateLimitKey(request) {
  return request.socket.remoteAddress || "unknown";
}

function requireAuthRateLimit(request, res, id) {
  const limit = AUTH_RATE_LIMITER.consume(authRateLimitKey(request));
  if (limit.allowed) return true;
  recordAudit(request, id, { action: "AUTH_RATE_LIMITED", resourceType: "auth_session", resourceId: "demo", actorType: "system", actorId: "edge", metadata: { reason: "AUTH_ATTEMPTS_EXCEEDED" } });
  res.setHeader("retry-after", Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1_000)));
  error(res, 429, "RATE_LIMITED", "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", id);
  return false;
}

function requireIdempotencyKey(request, res, id) {
  const key = idempotencyKey(request);
  if (!validateIdempotencyKey(key)) {
    error(res, 400, "VALIDATION_ERROR", "Idempotency-Key가 올바르지 않습니다.", id);
    return null;
  }
  return key;
}

function stockPayload(ticker) {
  const quote = marketProvider.getQuote(ticker);
  return { stock: marketProvider.getStock(ticker), quote, asOf: quote.asOf, dataStatus: quote.dataStatus };
}

function currentSignal(ticker) {
  return store.getCurrentSignal(ticker) || store.seedCurrentSignal(ticker, makeSignal(ticker, store.currentStreamCursor(ticker)));
}

function signalPayload(request, ticker) {
  if (!hasActiveSignalEntitlement(request)) {
    const preview = makeSignalPreview(ticker);
    return { locked: true, item: preview, items: [preview], nextCursor: null, asOf: preview.asOf, dataStatus: preview.dataStatus };
  }
  const signal = currentSignal(ticker);
  return {
    locked: false,
    item: signal,
    items: [signal],
    nextCursor: null,
    history: { events: store.listSignalEvents(ticker), revisions: store.listSignalRevisions(ticker) },
    snapshotCursor: { streamKey: signal.streamKey, epoch: signal.epoch, sequence: signal.sequence },
    asOf: signal.asOf,
    dataStatus: signal.dataStatus,
  };
}

function screenerResults(query) {
  const market = query?.market || "ALL";
  const priceChange = query?.priceChange || "ANY";
  const volume = query?.volume || "ANY";
  return marketProvider.listStocks().map((stock) => ({ ...stock, quote: marketProvider.getQuote(stock.ticker) })).filter((item) => {
    const marketMatches = market === "ALL" || item.marketType === market;
    const quote = item.quote;
    const directionMatches = priceChange === "ANY" || (priceChange === "UP" && quote.change > 0) || (priceChange === "DOWN" && quote.change < 0);
    const volumeMatches = volume === "ANY" || quote.volume > 700_000;
    return marketMatches && directionMatches && volumeMatches;
  });
}

function sendSse(res, eventType, payload, id) {
  res.write(`event: ${eventType}\n`);
  res.write(`id: ${id}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function revokeStreamsForUser(userId, reason, { requestId = null, traceId = null, triggeredAt = Date.now() } = {}) {
  let revokedCount = 0;
  const effectiveAt = new Date().toISOString();
  for (const client of openStreams) {
    if (client.userId !== userId || client.closed) continue;
    sendSse(client.res, "entitlement.revoked", { capability: ENTITLEMENT, reason, effectiveAt }, `revoke_${randomUUID().slice(0, 12)}`);
    METRICS.increment("stream_revoke_total", { reason });
    client.res.end();
    closeStreamClient(client);
    METRICS.observe("stream_revoke_latency_ms", Math.max(0, Date.now() - triggeredAt), { reason });
    revokedCount += 1;
  }
  if (revokedCount > 0) {
    AUDIT.append({ actorType: "system", actorId: "stream-gateway", action: "STREAM_REVOKED", resourceType: "stream", resourceId: userId, requestId, traceId, metadata: { reason, connectionCount: revokedCount } });
    METRICS.increment("audit_event_total", { action: "STREAM_REVOKED", resource_type: "stream" });
  }
}

function stopTickerStream(ticker) {
  const timer = streamTimers.get(ticker);
  if (!timer) return;
  clearInterval(timer);
  streamTimers.delete(ticker);
}

function closeStreamClient(client) {
  if (client.closed) return;
  client.closed = true;
  openStreams.delete(client);
  if (![...openStreams].some((candidate) => candidate.ticker === client.ticker && !candidate.closed)) stopTickerStream(client.ticker);
}

function publishTickerEvent(ticker) {
  const connected = [...openStreams].filter((client) => client.ticker === ticker && !client.closed);
  for (const client of connected) {
    if (!hasActiveSignalEntitlement(client.request)) revokeStreamsForUser(client.userId, "ENTITLEMENT_INACTIVE");
  }
  const clients = [...openStreams].filter((client) => client.ticker === ticker && !client.closed);
  if (!clients.length) {
    stopTickerStream(ticker);
    return;
  }

  const cursor = store.nextStreamCursor(ticker);
  const nextSignal = makeSignal(ticker, cursor);
  try {
    store.appendStreamEvent(ticker, nextSignal);
    void persistSnapshot().catch((cause) => console.error(JSON.stringify({ error: cause.message, code: cause.code || "SNAPSHOT_SAVE_FAILED" })));
  } catch (cause) {
    METRICS.increment("stream_publish_error_total", { reason: cause.code || "UNKNOWN" });
    console.error(JSON.stringify({ error: cause.message, ticker, streamKey: nextSignal.streamKey, sequence: nextSignal.sequence }));
    return;
  }
  void streamOutboxWorker.runOnce(1).catch((cause) => {
    METRICS.increment("stream_publish_error_total", { reason: "OUTBOX_WORKER" });
    console.error(JSON.stringify({ error: cause.message, ticker, streamKey: nextSignal.streamKey, sequence: nextSignal.sequence }));
  });
}

function ensureTickerStream(ticker) {
  if (streamTimers.has(ticker)) return;
  streamTimers.set(ticker, setInterval(() => publishTickerEvent(ticker), STREAM_TICK_MS));
}

function startStream(request, res, id) {
  if (!requireAccess(request, res, id, "subscriber")) return;
  const { userId } = roleContext(request);
  const url = new URL(request.url, "http://localhost");
  const ticker = url.searchParams.get("ticker") || "005930";
  if (!marketProvider.getStock(ticker)) return error(res, 404, "NOT_FOUND", "종목을 찾을 수 없습니다.", id);
  const demoGap = url.searchParams.get("demoGap") === "1";
  const signal = currentSignal(ticker);
  const resumeStreamKey = url.searchParams.get("streamKey");
  const resumeEpoch = url.searchParams.get("epoch");
  const resumeAfterSequence = url.searchParams.get("afterSequence");
  const resumeValues = [resumeStreamKey, resumeEpoch, resumeAfterSequence];
  const hasResumeCursor = resumeValues.some((value) => value !== null);
  const resumeEpochNumber = resumeEpoch === null ? null : Number(resumeEpoch);
  const resumeAfterSequenceNumber = resumeAfterSequence === null ? null : Number(resumeAfterSequence);
  if (hasResumeCursor && (resumeValues.some((value) => value === null) || resumeStreamKey !== signal.streamKey || !/^\d+$/.test(resumeEpoch) || !/^\d+$/.test(resumeAfterSequence) || !Number.isSafeInteger(resumeEpochNumber) || resumeEpochNumber < 1 || !Number.isSafeInteger(resumeAfterSequenceNumber) || resumeAfterSequenceNumber < 0)) {
    return error(res, 400, "INVALID_CURSOR", "스트림 재연결 cursor가 올바르지 않습니다.", id);
  }
  const resume = hasResumeCursor ? store.replayStream(signal.streamKey, resumeEpochNumber, resumeAfterSequenceNumber) : null;
  const currentCursor = { streamKey: signal.streamKey, epoch: signal.epoch, sequence: signal.sequence };
  res.writeHead(200, { ...securityHeaders({ production: PRODUCTION }), "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-request-id": id, "x-trace-id": id });
  const client = { request, res, userId, ticker, closed: false, demoGapPending: demoGap };
  openStreams.add(client);
  METRICS.increment("stream_connected_total", { transport: "sse" });
  const readyCursor = resume?.replayable ? { streamKey: signal.streamKey, epoch: resumeEpochNumber, sequence: resumeAfterSequenceNumber } : currentCursor;
  sendSse(res, "connection.ready", { streamKey: signal.streamKey, snapshotCursor: readyCursor, dataStatus: signal.dataStatus, ...(resume ? { resumed: resume.replayable, ...(resume.replayable ? {} : { resyncReason: resume.resyncReason }) } : {}) }, `ready_${id}`);
  if (resume?.replayable) {
    for (const event of resume.events) sendSse(res, "signal.changed", event, event.eventId);
  } else {
    sendSse(res, "signal.snapshot", { snapshotCursor: currentCursor, item: signal }, signal.eventId);
  }
  ensureTickerStream(ticker);

  request.on("close", () => closeStreamClient(client));
  res.on("close", () => closeStreamClient(client));
}

async function api(request, res, id) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  let parts;
  try {
    parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    recordAudit(request, id, { action: "PATH_REJECTED", resourceType: "request", resourceId: pathname, actorType: "system", actorId: "edge", metadata: { reason: "INVALID_ENCODING" } });
    return error(res, 400, "INVALID_PATH", "요청 경로 형식이 올바르지 않습니다.", id);
  }
  const method = request.method || "GET";

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && pathname !== "/api/v1/webhooks/payment" && pathname !== "/api/v1/auth/demo/session" && !requireCsrf(request, res, id)) return;

  if (pathname === "/api/v1/auth/demo/session" && method === "POST") {
    if (PRODUCTION) return error(res, 404, "NOT_FOUND", "요청한 API 경로를 찾을 수 없습니다.", id);
    if (!requireJsonContentType(request, res, id)) return;
    if (!requireAuthRateLimit(request, res, id)) return;
    let body;
    try {
      body = await parseJsonBody(request);
    } catch (cause) {
      if (cause.code === "BODY_TOO_LARGE") return error(res, 413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.", id);
      return error(res, 400, "VALIDATION_ERROR", "로그인 요청 형식이 올바르지 않습니다.", id);
    }
    const validation = validateDemoSession(body);
    if (!validation.ok) return error(res, 400, validation.code, validation.message, id, validation.details);
    const created = sessions.rotateFromRequest(request, { userId: validation.value.userId, role: "member", provider: "sandbox", providerSubject: `sandbox:${validation.value.userId}` }, { production: PRODUCTION });
    METRICS.increment("auth_session_total", { action: "created", provider: "sandbox" });
    recordAudit(request, id, { action: "AUTH_SESSION_CREATED", resourceType: "session", resourceId: created.session.id, actorId: created.session.userId, metadata: { provider: created.session.provider } });
    return json(res, 201, { authenticated: true, userId: created.session.userId, role: created.session.role, csrfToken: created.session.csrfToken, expiresAt: new Date(created.session.expiresAt).toISOString(), provider: created.session.provider }, id, {
      "set-cookie": serializeSessionCookie(created.token, { production: PRODUCTION, maxAge: Math.max(1, Math.ceil(SESSION_TTL / 1_000)) }),
    });
  }

  if (pathname === "/api/v1/auth/me" && method === "GET") {
    const session = currentSession(request);
    return json(res, 200, session ? { authenticated: true, userId: session.userId, role: session.role, csrfToken: session.csrfToken, expiresAt: new Date(session.expiresAt).toISOString(), provider: session.provider } : { authenticated: false }, id);
  }

  if (pathname === "/api/v1/auth/logout" && method === "POST") {
    const session = currentSession(request);
    sessions.revokeFromRequest(request, { production: PRODUCTION });
    if (session) {
      revokeStreamsForUser(session.userId, "LOGOUT", { requestId: id, traceId: id });
      METRICS.increment("auth_session_total", { action: "revoked", provider: "sandbox" });
      recordAudit(request, id, { action: "AUTH_LOGOUT", resourceType: "session", resourceId: session.id, actorId: session.userId, metadata: { provider: session.provider } });
    }
    return json(res, 200, { authenticated: false }, id, { "set-cookie": serializeSessionCookie("", { production: PRODUCTION, maxAge: 0 }) });
  }

  if (pathname === "/api/v1/stream" && method === "GET") return startStream(request, res, id);
  if (pathname === "/api/v1/stream/replay" && method === "GET") {
    if (!requireAccess(request, res, id, "subscriber")) return;
    const streamKey = url.searchParams.get("streamKey") || "";
    const epoch = Number(url.searchParams.get("epoch"));
    const afterSequence = Number(url.searchParams.get("afterSequence"));
    const ticker = streamKey.match(/^signal:(\d{6}):default$/)?.[1];
    if (!ticker || !marketProvider.getStock(ticker) || !Number.isSafeInteger(epoch) || epoch < 1 || !Number.isSafeInteger(afterSequence) || afterSequence < 0) return error(res, 400, "INVALID_CURSOR", "replay cursor가 올바르지 않습니다.", id);
    const replay = store.replayStream(streamKey, epoch, afterSequence);
    METRICS.increment("stream_replay_total", { replayable: replay.replayable });
    const snapshot = replay.replayable ? undefined : currentSignal(ticker);
    return json(res, 200, { streamKey, epoch, afterSequence, ...replay, ...(snapshot ? { snapshot: { snapshotCursor: { streamKey: snapshot.streamKey, epoch: snapshot.epoch, sequence: snapshot.sequence }, item: snapshot } } : {}) }, id);
  }
  if (parts[0] !== "api" || parts[1] !== "v1") return error(res, 404, "NOT_FOUND", "API 경로를 찾을 수 없습니다.", id);

  if (method === "GET" && pathname === "/api/v1/market/overview") return json(res, 200, marketProvider.getMarketOverview(), id);

  if (method === "GET" && pathname === "/api/v1/stocks/search") {
    const query = url.searchParams.get("q") || "";
    if (query && !validateSearchQuery(query)) return error(res, 400, "VALIDATION_ERROR", "검색어는 1~50자로 입력해 주세요.", id);
    const page = pageList(marketProvider.search(query), url.searchParams.get("cursor"), `stocks:search:${query.trim().toLowerCase()}`, res, id);
    if (!page) return;
    return json(res, 200, { items: page.items, nextCursor: page.nextCursor, asOf: new Date().toISOString(), dataStatus: "REALTIME" }, id);
  }

  if (parts[2] === "stocks" && parts[3] && method === "GET") {
    const ticker = parts[3];
    if (!validateTicker(ticker, res, id)) return;
    const subresource = parts[4];
    if (!subresource) return json(res, 200, stockPayload(ticker), id);
    if (subresource === "quote") return json(res, 200, marketProvider.getQuote(ticker, url.searchParams.get("demoStatus") || "REALTIME"), id);
    if (subresource === "chart") return json(res, 200, marketProvider.getChart(ticker), id);
    if (subresource === "flows") {
      if (!requireAccess(request, res, id, "member")) return;
      const data = marketProvider.getFlows(ticker);
      const page = pageList(data.items, url.searchParams.get("cursor"), `flows:${ticker}`, res, id);
      if (!page) return;
      return json(res, 200, { ...data, items: page.items, nextCursor: page.nextCursor }, id);
    }
    if (subresource === "news") {
      const data = marketProvider.getNews(ticker);
      const page = pageList(data.items, url.searchParams.get("cursor"), `news:${ticker}`, res, id);
      if (!page) return;
      return json(res, 200, { ...data, items: page.items, nextCursor: page.nextCursor }, id);
    }
    if (subresource === "financials") {
      if (!requireAccess(request, res, id, "member")) return;
      const data = marketProvider.getFinancials(ticker);
      const page = pageList(data.items, url.searchParams.get("cursor"), `financials:${ticker}`, res, id);
      if (!page) return;
      return json(res, 200, { ...data, items: page.items, nextCursor: page.nextCursor }, id);
    }
    if (subresource === "signals") {
      return json(res, 200, signalPayload(request, ticker), id);
    }
  }

  if (method === "GET" && pathname === "/api/v1/signals") {
    if (hasActiveSignalEntitlement(request)) {
      const items = marketProvider.listStocks().map((stock) => currentSignal(stock.ticker));
      const page = pageList(items, url.searchParams.get("cursor"), "signals:premium", res, id);
      if (!page) return;
      return json(res, 200, { locked: false, items: page.items, nextCursor: page.nextCursor, asOf: new Date().toISOString(), dataStatus: "REALTIME" }, id);
    }
    const page = pageList(marketProvider.listStocks().map((stock) => makeSignalPreview(stock.ticker)), url.searchParams.get("cursor"), "signals:preview", res, id);
    if (!page) return;
    return json(res, 200, { locked: true, items: page.items, nextCursor: page.nextCursor, asOf: new Date().toISOString(), dataStatus: "REALTIME" }, id);
  }

  if (pathname === "/api/v1/screener/conditions" && method === "GET") {
    if (!requireAccess(request, res, id, "member")) return;
    return json(res, 200, { items: makeConditions(), asOf: new Date().toISOString(), dataStatus: "REALTIME" }, id);
  }

  if (pathname === "/api/v1/screener/query" && method === "POST") {
    if (!requireAccess(request, res, id, "member")) return;
    if (!requireJsonContentType(request, res, id)) return;
    try {
      const body = await parseJsonBody(request);
      const validation = validateScreenerQuery(body);
      if (!validation.ok) return error(res, 400, validation.code, validation.message, id, validation.details);
      const { userId, role } = roleContext(request);
      const scope = `screener:${role}:${userId}:${JSON.stringify(validation.value)}`;
      const page = pageList(screenerResults(validation.value), url.searchParams.get("cursor"), scope, res, id);
      if (!page) return;
      return json(res, 200, { items: page.items, nextCursor: page.nextCursor, query: validation.value, asOf: new Date().toISOString(), dataStatus: "REALTIME", limitations: ["승인된 구조화 조건만 실행됩니다.", "결과는 데모 fixture 기준입니다."] }, id);
    } catch (cause) {
      if (cause.code === "UPSTREAM_UNAVAILABLE") throw cause;
      if (cause.code === "BODY_TOO_LARGE") return error(res, 413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.", id);
      return error(res, 400, ["INVALID_JSON", "INVALID_ENCODING"].includes(cause.message) ? "VALIDATION_ERROR" : "INTERNAL_ERROR", "조건을 처리하지 못했습니다.", id);
    }
  }

  if (pathname === "/api/v1/watchlists" && method === "GET") {
    if (!requireAccess(request, res, id, "member")) return;
    const { userId } = roleContext(request);
    const page = pageList(store.listWatchlist(userId, marketProvider), url.searchParams.get("cursor"), `watchlist:${userId}`, res, id);
    if (!page) return;
    return json(res, 200, { items: page.items, watchlistId: `watchlist-${userId}`, nextCursor: page.nextCursor, asOf: new Date().toISOString(), dataStatus: "REALTIME" }, id);
  }

  if (pathname === "/api/v1/watchlists" && method === "POST") {
    if (!requireAccess(request, res, id, "member")) return;
    if (!requireJsonContentType(request, res, id)) return;
    const key = requireIdempotencyKey(request, res, id);
    if (!key) return;
    try {
      const body = await parseJsonBody(request);
      const validation = validateWatchlistMutation(body);
      if (!validation.ok) return error(res, 400, validation.code, validation.message, id, validation.details);
      if (!validateTicker(validation.value.ticker, res, id)) return;
      const result = store.addWatchlistItem(roleContext(request).userId, validation.value.ticker, key);
      await persistSnapshot();
      recordAudit(request, id, { action: result.duplicate ? "WATCHLIST_ITEM_DUPLICATE" : "WATCHLIST_ITEM_ADDED", resourceType: "watchlist_item", resourceId: `${roleContext(request).userId}:${validation.value.ticker}`, metadata: { ticker: validation.value.ticker, duplicate: result.duplicate } });
      return json(res, result.duplicate ? 200 : 201, { ...result, item: { ...marketProvider.getStock(validation.value.ticker), quote: marketProvider.getQuote(validation.value.ticker) } }, id);
    } catch (cause) {
      if (cause.code === "UPSTREAM_UNAVAILABLE") throw cause;
      if (cause.code === "BODY_TOO_LARGE") return error(res, 413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.", id);
      if (cause.code === "IDEMPOTENCY_CONFLICT") return error(res, 409, cause.code, "같은 Idempotency-Key를 다른 요청에 재사용할 수 없습니다.", id);
      return error(res, 400, "VALIDATION_ERROR", "관심종목 요청을 확인해 주세요.", id, { reason: cause.message });
    }
  }

  if (parts[2] === "watchlists" && parts[3] && parts[4] === "items" && parts[5] && method === "DELETE") {
    if (!requireAccess(request, res, id, "member")) return;
    if (!validateWatchlistOwnership(request, parts[3], res, id)) return;
    const key = requireIdempotencyKey(request, res, id);
    if (!key) return;
    const ticker = parts[5];
    if (!validateTicker(ticker, res, id)) return;
    try {
      const result = store.removeWatchlistItem(roleContext(request).userId, ticker, key);
      await persistSnapshot();
      recordAudit(request, id, { action: "WATCHLIST_ITEM_REMOVED", resourceType: "watchlist_item", resourceId: `${roleContext(request).userId}:${ticker}`, metadata: { ticker, removed: result.removed } });
      return json(res, 200, result, id);
    } catch (cause) {
      if (cause.code === "IDEMPOTENCY_CONFLICT") return error(res, 409, cause.code, "같은 Idempotency-Key를 다른 요청에 재사용할 수 없습니다.", id);
      throw cause;
    }
  }

  if (pathname === "/api/v1/entitlements/me" && method === "GET") {
    if (!requireAccess(request, res, id, "member")) return;
    const { userId, role } = roleContext(request);
    const subscription = store.getSubscription(userId, role);
    return json(res, 200, { items: [{ ...entitlementForSubscription(subscription), capability: ENTITLEMENT }], asOf: new Date().toISOString() }, id);
  }

  if (pathname === "/api/v1/subscriptions/me" && method === "GET") {
    if (!requireAccess(request, res, id, "member")) return;
    const { userId, role } = roleContext(request);
    return json(res, 200, { subscription: store.getSubscription(userId, role), asOf: new Date().toISOString() }, id);
  }

  if (pathname === "/api/v1/subscriptions/checkout" && method === "POST") {
    if (!requireAccess(request, res, id, "member")) return;
    if (!requireJsonContentType(request, res, id)) return;
    const key = requireIdempotencyKey(request, res, id);
    if (!key) return;
    let body;
    try {
      body = await parseJsonBody(request);
    } catch (cause) {
      if (cause.code === "BODY_TOO_LARGE") return error(res, 413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.", id);
      return error(res, 400, "VALIDATION_ERROR", "checkout 요청 형식이 올바르지 않습니다.", id);
    }
    const checkoutValidation = validateCheckout(body);
    if (!checkoutValidation.ok) return error(res, 400, checkoutValidation.code, checkoutValidation.message, id, checkoutValidation.details);
    try {
      const subscription = store.checkout(roleContext(request).userId, key);
      await persistSnapshot();
      recordAudit(request, id, { action: "SUBSCRIPTION_CHECKOUT_STARTED", resourceType: "subscription", resourceId: roleContext(request).userId, metadata: { status: subscription.status, provider: subscription.provider || "sandbox" } });
      return json(res, 202, { subscription, message: "결제 확인 중입니다. 권한이 활성화되면 신호를 확인할 수 있습니다." }, id);
    } catch (cause) {
      if (cause.code === "IDEMPOTENCY_CONFLICT") return error(res, 409, cause.code, "같은 Idempotency-Key를 다른 요청에 재사용할 수 없습니다.", id);
      throw cause;
    }
  }

  if (pathname === "/api/v1/subscriptions/cancel" && method === "POST") {
    if (!requireAccess(request, res, id, "member")) return;
    const key = requireIdempotencyKey(request, res, id);
    if (!key) return;
    try {
      const subscription = store.cancel(roleContext(request).userId, key);
      await persistSnapshot();
      recordAudit(request, id, { action: "SUBSCRIPTION_CANCEL_REQUESTED", resourceType: "subscription", resourceId: roleContext(request).userId, metadata: { status: subscription.status } });
      return json(res, 200, { subscription, asOf: new Date().toISOString() }, id);
    } catch (cause) {
      if (cause.code === "IDEMPOTENCY_CONFLICT") return error(res, 409, cause.code, "같은 Idempotency-Key를 다른 요청에 재사용할 수 없습니다.", id);
      throw cause;
    }
  }

  if (pathname === "/api/v1/webhooks/payment" && method === "POST") {
    if (PRODUCTION) {
      const reason = paymentWebhookConfigured ? "PAYMENT_PROVIDER_SANDBOX" : "PAYMENT_NOT_CONFIGURED";
      recordAudit(request, id, { action: "PAYMENT_WEBHOOK_REJECTED", resourceType: "payment_webhook", actorType: "system", actorId: "configuration", metadata: { reason } });
      return error(res, 503, reason, "운영 결제 provider adapter가 준비되지 않았습니다.", id);
    }
    if (!requireJsonContentType(request, res, id)) return;
    let rawBody;
    try {
      rawBody = await parseRawBody(request);
    } catch (cause) {
      const tooLarge = cause.code === "BODY_TOO_LARGE";
      recordAudit(request, id, { action: "PAYMENT_WEBHOOK_REJECTED", resourceType: "payment_webhook", metadata: { reason: tooLarge ? "BODY_TOO_LARGE" : "BODY_READ_FAILED" } });
      return error(res, tooLarge ? 413 : 400, tooLarge ? "PAYLOAD_TOO_LARGE" : "WEBHOOK_REJECTED", tooLarge ? "요청 본문이 너무 큽니다." : "결제 이벤트 본문을 읽을 수 없습니다.", id);
    }
    if (!hasValidPaymentSignature(request, rawBody)) {
      recordAudit(request, id, { action: "PAYMENT_WEBHOOK_REJECTED", resourceType: "payment_webhook", metadata: { reason: "INVALID_SIGNATURE" } });
      return error(res, 401, "WEBHOOK_REJECTED", "결제 이벤트 서명을 확인할 수 없습니다.", id);
    }
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      recordAudit(request, id, { action: "PAYMENT_WEBHOOK_REJECTED", resourceType: "payment_webhook", metadata: { reason: "INVALID_JSON" } });
      return error(res, 400, "WEBHOOK_REJECTED", "결제 이벤트 형식이 올바르지 않습니다.", id);
    }
    const validation = validatePaymentWebhook(event);
    if (!validation.ok) {
      recordAudit(request, id, { action: "PAYMENT_WEBHOOK_REJECTED", resourceType: "payment_webhook", actorType: "provider", actorId: typeof event?.provider === "string" ? event.provider : null, metadata: { reason: validation.code || "VALIDATION_ERROR" } });
      return error(res, 400, validation.code, validation.message, id, validation.details);
    }
    let result;
    try {
      result = store.applyPaymentWebhook(event);
    } catch (cause) {
      if (cause.code === "PAYMENT_EVENT_CONFLICT") {
        recordAudit(request, id, { action: "PAYMENT_WEBHOOK_REJECTED", resourceType: "payment_webhook", actorType: "provider", actorId: event.provider, metadata: { reason: cause.code } });
        return error(res, 409, cause.code, "같은 provider event ID에 다른 결제 이벤트 내용이 도착했습니다.", id);
      }
      throw cause;
    }
    await persistSnapshot();
    METRICS.increment("payment_webhook_total", { applied: result.applied, duplicate: result.duplicate || false });
    recordAudit(request, id, { action: "PAYMENT_WEBHOOK_PROCESSED", resourceType: "payment_event", resourceId: `${event.provider}:${event.providerEventId}`, actorType: "provider", actorId: event.provider, metadata: { eventType: event.eventType, revision: event.revision, applied: result.applied, duplicate: result.duplicate || false, status: result.status || result.reason || "UNKNOWN" } });
    if (result.applied && shouldRevokeEntitlement(result.status)) revokeStreamsForUser(event.userId, result.status, { requestId: id, traceId: id });
    return json(res, 200, { result }, id);
  }

  return error(res, 404, "NOT_FOUND", "요청한 API를 찾을 수 없습니다.", id);
}

async function staticFile(request, res) {
  const url = new URL(request.url, "http://localhost");
  let relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  relative = normalize(relative);
  if (relative.startsWith("..") || relative.includes("\\")) return res.writeHead(404).end();
  const filename = join(PUBLIC_DIR, relative);
  if (!existsSync(filename)) return res.writeHead(404).end("Not found");
  try {
    const content = await readFile(filename);
    res.writeHead(200, { ...securityHeaders({ production: PRODUCTION }), "content-type": MIME_TYPES[extname(filename)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(content);
  } catch {
    res.writeHead(500).end("Internal Server Error");
  }
}

let runtimeStarted = false;
function ensureRuntimeStarted() {
  if (runtimeStarted) return;
  runtimeStarted = true;
  streamOutboxWorker.start(OUTBOX_WORKER_INTERVAL_MS, 50);
}

export async function handleRequest(request, res) {
  const id = requestId(request);
  const startedAt = Date.now();
  const path = new URL(request.url || "/", "http://localhost").pathname;
  const probePath = path.startsWith("/api/") ? path.slice(4) : path;
  try {
    ensureRuntimeStarted();
    const origin = request.headers.origin;
    if (!isAllowedOrigin(origin, allowedOrigins)) {
      recordAudit(request, id, { action: "ORIGIN_REJECTED", resourceType: "request", resourceId: path, actorType: "system", actorId: "edge" });
      return error(res, 403, "ORIGIN_REJECTED", "허용되지 않은 요청 출처입니다.", id);
    }
    if (probePath === "/healthz" && (request.method === "GET" || request.method === "HEAD")) return json(res, 200, { status: "ok", service: "stock-research-demo" }, id);
    if (probePath === "/readyz" && (request.method === "GET" || request.method === "HEAD")) {
      const state = readiness();
      return json(res, state.status === "ready" ? 200 : 503, state, id);
    }
    if (probePath === "/internal/metrics" && request.method === "GET") {
      const expectedToken = process.env.INTERNAL_METRICS_TOKEN;
      if (PRODUCTION && !metricsTokenConfigured) return error(res, 503, "METRICS_NOT_CONFIGURED", "운영 metrics 접근 토큰이 설정되지 않았습니다.", id);
      if (metricsTokenConfigured && request.headers["x-metrics-token"] !== expectedToken) return error(res, 401, "AUTH_REQUIRED", "metrics 접근 권한이 필요합니다.", id);
      res.writeHead(200, { ...securityHeaders({ production: PRODUCTION }), "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store", "x-request-id": id, "x-trace-id": id });
      return res.end(METRICS.toPrometheus());
    }
    if (path.startsWith("/api/")) {
      const limit = RATE_LIMITER.consume(`${request.socket?.remoteAddress || request.headers["x-forwarded-for"] || "unknown"}:${path}`);
      if (!limit.allowed) {
        recordAudit(request, id, { action: "RATE_LIMITED", resourceType: "request", resourceId: path, actorType: "system", actorId: "edge" });
        res.setHeader("retry-after", Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000)));
        return error(res, 429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", id);
      }
      await api(request, res, id);
    } else await staticFile(request, res);
  } catch (cause) {
    if (!res.headersSent) {
      const unavailable = cause.code === "UPSTREAM_UNAVAILABLE";
      error(res, unavailable ? 503 : 500, unavailable ? "UPSTREAM_UNAVAILABLE" : "INTERNAL_ERROR", unavailable ? "시장 데이터 공급자를 사용할 수 없습니다." : "일시적인 서버 오류가 발생했습니다.", id);
    }
    else res.end();
    console.error(JSON.stringify({ requestId: id, error: cause.message }));
  } finally {
    METRICS.increment("http_requests_total", { method: request.method || "GET", path, status: res.statusCode || 500 });
    METRICS.observe("http_request_duration_ms", Date.now() - startedAt, { path });
  }
}

const server = process.env.VERCEL === "1" ? null : createServer(handleRequest);
if (server) {
  server.listen(PORT, () => {
    ensureRuntimeStarted();
    console.log(`Stock research demo listening on http://localhost:${PORT}`);
  });
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  streamOutboxWorker.stop();
  await streamOutboxWorker.waitForIdle();
  for (const client of openStreams) client.res.end();
  const finish = async () => {
    try {
      const result = await persistSnapshot();
      if (result.saved) console.log("Saved sandbox store snapshot");
      process.exit(0);
    } catch (cause) {
      console.error(JSON.stringify({ error: cause.message, code: cause.code || "SNAPSHOT_SAVE_FAILED" }));
      process.exit(1);
    }
  };
  if (server) server.close(() => { void finish(); });
  else await finish();
}

if (server) process.on("SIGTERM", () => { void shutdown(); });
