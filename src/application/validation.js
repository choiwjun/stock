import { DATA_STATUSES, SIGNAL_STATUSES } from "../domain/constants.js";

export const PAYMENT_EVENT_TYPES = Object.freeze([
  "payment.succeeded",
  "payment.failed",
  "subscription.cancelled",
  "refund.pending",
  "refund.completed",
  "subscription.suspended",
  "subscription.expired",
]);
const PAYMENT_EVENT_FIELDS = new Set(["provider", "providerEventId", "userId", "revision", "eventType", "endsAt", "cancelAt", "failureReason"]);

const SCREENER_VALUES = Object.freeze({
  market: new Set(["ALL", "KOSPI", "KOSDAQ"]),
  priceChange: new Set(["ANY", "UP", "DOWN"]),
  volume: new Set(["ANY", "HIGH"]),
});
const WATCHLIST_FIELDS = new Set(["ticker"]);

function invalid(message, details = undefined) {
  return { ok: false, code: "VALIDATION_ERROR", message, ...(details ? { details } : {}) };
}

const SIGNAL_DIRECTIONS = new Set(["BUY", "SELL", "NEUTRAL"]);
const SIGNAL_STRENGTHS = new Set(["LOW", "MEDIUM", "HIGH"]);
const SIGNAL_EVENT_FIELDS = new Set([
  "eventId",
  "streamKey",
  "epoch",
  "sequence",
  "ticker",
  "strategyKey",
  "direction",
  "status",
  "effectiveStatus",
  "dataStatus",
  "strength",
  "occurredAt",
  "publishedAt",
  "asOf",
  "validUntil",
  "lastHeartbeatAt",
  "lastEvaluatedAt",
  "staleAfter",
  "healthReason",
  "algorithmVersion",
  "evidence",
  "riskDisclosureId",
]);
const SIGNAL_EVIDENCE_FIELDS = new Set(["type", "label", "value"]);

function isIsoDateTime(value) {
  return typeof value === "string" && /T/.test(value) && Number.isFinite(Date.parse(value));
}

function isJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, nextAncestors));
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.entries(value).every(([key, item]) => typeof key === "string" && isJsonValue(item, nextAncestors));
}

function invalidSignal(field, message) {
  return invalid(message, { field });
}

export function validateSignalEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return invalid("신호 이벤트 객체가 필요합니다.");
  if (Object.keys(event).some((field) => !SIGNAL_EVENT_FIELDS.has(field))) return invalidSignal("event", "지원하지 않는 신호 이벤트 필드가 있습니다.");
  if (typeof event.eventId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(event.eventId)) return invalidSignal("eventId", "eventId가 올바르지 않습니다.");
  if (typeof event.streamKey !== "string" || !/^signal:[0-9]{6}:default$/.test(event.streamKey)) return invalidSignal("streamKey", "streamKey가 올바르지 않습니다.");
  if (!Number.isSafeInteger(event.epoch) || event.epoch < 1) return invalidSignal("epoch", "epoch가 올바르지 않습니다.");
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) return invalidSignal("sequence", "sequence가 올바르지 않습니다.");
  if (event.ticker !== event.streamKey.slice(7, 13) || !/^[0-9]{6}$/.test(event.ticker)) return invalidSignal("ticker", "ticker와 streamKey가 일치하지 않습니다.");
  if (event.strategyKey !== "default") return invalidSignal("strategyKey", "strategyKey가 올바르지 않습니다.");
  if (!SIGNAL_DIRECTIONS.has(event.direction)) return invalidSignal("direction", "direction이 올바르지 않습니다.");
  if (!SIGNAL_STATUSES.includes(event.status)) return invalidSignal("status", "status가 올바르지 않습니다.");
  if (event.effectiveStatus !== undefined && !SIGNAL_STATUSES.includes(event.effectiveStatus)) return invalidSignal("effectiveStatus", "effectiveStatus가 올바르지 않습니다.");
  if (!DATA_STATUSES.includes(event.dataStatus)) return invalidSignal("dataStatus", "dataStatus가 올바르지 않습니다.");
  if (!SIGNAL_STRENGTHS.has(event.strength)) return invalidSignal("strength", "strength가 올바르지 않습니다.");
  for (const field of ["occurredAt", "publishedAt", "asOf", "lastHeartbeatAt", "lastEvaluatedAt", "staleAfter"]) {
    if (!isIsoDateTime(event[field])) return invalidSignal(field, `${field}가 ISO 시각이 아닙니다.`);
  }
  if (event.validUntil !== null && !isIsoDateTime(event.validUntil)) return invalidSignal("validUntil", "validUntil이 ISO 시각이 아닙니다.");
  if (Date.parse(event.publishedAt) < Date.parse(event.occurredAt)) return invalidSignal("publishedAt", "publishedAt은 occurredAt보다 이전일 수 없습니다.");
  if (typeof event.healthReason !== "string" || event.healthReason.length < 1 || event.healthReason.length > 64) return invalidSignal("healthReason", "healthReason이 올바르지 않습니다.");
  if (typeof event.algorithmVersion !== "string" || event.algorithmVersion.length < 1 || event.algorithmVersion.length > 128) return invalidSignal("algorithmVersion", "algorithmVersion이 올바르지 않습니다.");
  if (!Array.isArray(event.evidence)) return invalidSignal("evidence", "evidence 배열이 필요합니다.");
  if (event.evidence.some((item) => !item || typeof item !== "object" || Object.keys(item).some((field) => !SIGNAL_EVIDENCE_FIELDS.has(field)) || typeof item.type !== "string" || typeof item.label !== "string" || !("value" in item) || !isJsonValue(item.value))) return invalidSignal("evidence", "evidence snapshot 형식이 올바르지 않습니다.");
  if (typeof event.riskDisclosureId !== "string" || event.riskDisclosureId.length < 1 || event.riskDisclosureId.length > 128) return invalidSignal("riskDisclosureId", "riskDisclosureId가 올바르지 않습니다.");
  return { ok: true, value: event };
}

export function validateIdempotencyKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}

export function validateSearchQuery(value) {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 50;
}

export function validateDemoSession(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("로그인 요청 형식이 올바르지 않습니다.");
  const userId = body.userId;
  if (typeof userId !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(userId)) return invalid("sandbox userId가 올바르지 않습니다.", { field: "userId" });
  return { ok: true, value: { userId } };
}

export function validateScreenerQuery(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("스크리너 조건 객체가 필요합니다.");
  if (Object.keys(body).some((key) => !SCREENER_VALUES[key])) return invalid("지원하지 않는 스크리너 조건이 있습니다.", { field: "query" });
  const value = {};
  for (const [key, allowed] of Object.entries(SCREENER_VALUES)) {
    const candidate = body[key] ?? (key === "market" ? "ALL" : "ANY");
    if (typeof candidate !== "string" || !allowed.has(candidate)) return invalid(`허용되지 않은 ${key} 조건입니다.`, { field: key });
    value[key] = candidate;
  }
  return { ok: true, value };
}

export function validateCheckout(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("checkout 요청 객체가 필요합니다.");
  if (Object.keys(body).some((key) => key !== "plan")) return invalid("지원하지 않는 checkout 필드가 있습니다.", { field: "checkout" });
  if (body.plan !== undefined && body.plan !== "ALGORITHM_SIGNAL_MONTHLY") return invalid("허용되지 않은 상품입니다.", { field: "plan" });
  return { ok: true, value: { plan: "ALGORITHM_SIGNAL_MONTHLY" } };
}

export function validateWatchlistMutation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("관심목록 요청 객체가 필요합니다.");
  if (Object.keys(body).some((key) => !WATCHLIST_FIELDS.has(key))) return invalid("지원하지 않는 관심목록 필드가 있습니다.", { field: "watchlist" });
  if (typeof body.ticker !== "string" || !/^\d{6}$/.test(body.ticker)) return invalid("ticker가 올바르지 않습니다.", { field: "ticker" });
  return { ok: true, value: { ticker: body.ticker } };
}

export function validatePaymentWebhook(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return invalid("결제 이벤트 객체가 필요합니다.");
  if (Object.keys(event).some((field) => !PAYMENT_EVENT_FIELDS.has(field))) return invalid("지원하지 않는 결제 이벤트 필드가 있습니다.", { field: "event" });
  if (typeof event.provider !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(event.provider)) return invalid("provider가 올바르지 않습니다.", { field: "provider" });
  if (typeof event.providerEventId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(event.providerEventId)) return invalid("providerEventId가 올바르지 않습니다.", { field: "providerEventId" });
  if (typeof event.userId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(event.userId)) return invalid("userId가 올바르지 않습니다.", { field: "userId" });
  if (!Number.isInteger(event.revision) || event.revision < 1) return invalid("revision이 올바르지 않습니다.", { field: "revision" });
  if (!PAYMENT_EVENT_TYPES.includes(event.eventType)) return invalid("지원하지 않는 결제 이벤트입니다.", { field: "eventType" });
  for (const field of ["endsAt", "cancelAt"]) {
    if (event[field] !== undefined && !isIsoDateTime(event[field])) return invalid(`${field}가 ISO 시각이 아닙니다.`, { field });
  }
  if (event.failureReason !== undefined && (typeof event.failureReason !== "string" || event.failureReason.length > 256)) return invalid("failureReason이 올바르지 않습니다.", { field: "failureReason" });
  return { ok: true, value: event };
}
