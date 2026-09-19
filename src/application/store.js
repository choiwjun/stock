import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { DEMO_USER_ID, PRIMARY_TICKER, getStock, makeQuote } from "../domain/fixtures.js";
import { compareCursor } from "../domain/cursor.js";
import { SUBSCRIPTION_STATUSES, entitlementForSubscription, transitionSubscription } from "../domain/subscription.js";
import { SIGNAL_STATUSES } from "../domain/constants.js";
import { OutboxQueue } from "./outbox.js";
import { validateSignalEvent } from "./validation.js";

function paymentEventFingerprint(event) {
  const canonical = Object.entries(event).sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

const SIGNAL_STREAM_PATTERN = /^signal:(\d{6}):default$/;

function invalidStoreSnapshot() {
  const error = new Error("INVALID_STORE_SNAPSHOT");
  error.code = "INVALID_STORE_SNAPSHOT";
  return error;
}

function failSnapshot() {
  throw invalidStoreSnapshot();
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSafeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateSignalSnapshot(event, streamKey) {
  const validation = validateSignalEvent(event);
  if (!validation.ok || event.streamKey !== streamKey) failSnapshot();
}

function validateSignalList(events, streamKey) {
  if (!Array.isArray(events)) failSnapshot();
  let previous = null;
  for (const event of events) {
    validateSignalSnapshot(event, streamKey);
    if (previous && (compareCursor(event, previous) === null || compareCursor(event, previous) <= 0)) failSnapshot();
    previous = event;
  }
}

function validateSubscriptionSnapshot(subscription) {
  if (!subscription || typeof subscription !== "object" || Array.isArray(subscription) || !SUBSCRIPTION_STATUSES.includes(subscription.status) || !Number.isSafeInteger(subscription.statusRevision) || subscription.statusRevision < 0) failSnapshot();
  if (subscription.autoRenew !== undefined && typeof subscription.autoRenew !== "boolean") failSnapshot();
  for (const field of ["startedAt", "endsAt", "cancelAt"]) {
    if (subscription[field] !== undefined && subscription[field] !== null && !isIsoDate(subscription[field])) failSnapshot();
  }
  if (subscription.activateAt !== undefined && !Number.isFinite(subscription.activateAt)) failSnapshot();
  if (subscription.provider !== undefined && typeof subscription.provider !== "string") failSnapshot();
  if (subscription.providerRevision !== undefined && !isSafeNonNegativeInteger(subscription.providerRevision)) failSnapshot();
  if (subscription.failureReason !== undefined && (typeof subscription.failureReason !== "string" || subscription.failureReason.length > 256)) failSnapshot();
}

function validateRevisionSnapshot(revision) {
  if (!revision || typeof revision !== "object" || Array.isArray(revision) || !Number.isSafeInteger(revision.revision) || revision.revision < 1 || typeof revision.eventId !== "string" || !isIsoDate(revision.inputAsOf) || typeof revision.algorithmVersion !== "string" || !SIGNAL_STATUSES.includes(revision.evaluationStatus) || !Array.isArray(revision.evidenceSnapshot) || !isIsoDate(revision.createdAt)) failSnapshot();
  for (const evidence of revision.evidenceSnapshot) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || typeof evidence.type !== "string" || typeof evidence.label !== "string" || !("value" in evidence)) failSnapshot();
  }
}

export class DemoStore {
  constructor() {
    this.watchlists = new Map([[DEMO_USER_ID, new Set()]]);
    this.subscriptions = new Map();
    this.idempotency = new Map();
    this.streamSequence = new Map();
    this.streamEvents = new Map();
    this.signalHistory = new Map();
    this.signalCurrent = new Map();
    this.signalRevisions = new Map();
    this.paymentEvents = new Map();
    this.providerRevisions = new Map();
    this.outbox = new OutboxQueue();
  }

  snapshot() {
    return {
      version: 1,
      watchlists: [...this.watchlists].map(([userId, tickers]) => [userId, [...tickers]]),
      subscriptions: [...this.subscriptions].map(([userId, subscription]) => [userId, structuredClone(subscription)]),
      idempotency: [...this.idempotency].map(([key, record]) => [key, structuredClone(record)]),
      streamSequence: [...this.streamSequence],
      streamEvents: [...this.streamEvents].map(([streamKey, events]) => [streamKey, structuredClone(events)]),
      signalHistory: [...this.signalHistory].map(([streamKey, events]) => [streamKey, structuredClone(events)]),
      signalCurrent: [...this.signalCurrent].map(([streamKey, signal]) => [streamKey, structuredClone(signal)]),
      signalRevisions: [...this.signalRevisions].map(([streamKey, revisions]) => [streamKey, structuredClone(revisions)]),
      paymentEvents: [...this.paymentEvents].map(([key, event]) => [key, structuredClone(event)]),
      providerRevisions: [...this.providerRevisions],
      outbox: this.outbox.snapshot(),
    };
  }

  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.watchlists) || !Array.isArray(snapshot.subscriptions) || !Array.isArray(snapshot.idempotency) || !Array.isArray(snapshot.streamSequence) || !Array.isArray(snapshot.streamEvents) || !Array.isArray(snapshot.signalHistory) || !Array.isArray(snapshot.signalCurrent) || !Array.isArray(snapshot.signalRevisions) || !Array.isArray(snapshot.paymentEvents) || !Array.isArray(snapshot.providerRevisions)) {
      failSnapshot();
    }

    const watchlists = new Map();
    for (const entry of snapshot.watchlists) {
      if (!Array.isArray(entry) || entry.length !== 2) failSnapshot();
      const [userId, tickers] = entry;
      if (typeof userId !== "string" || userId.length < 1 || !Array.isArray(tickers) || watchlists.has(userId) || new Set(tickers).size !== tickers.length) failSnapshot();
      if (tickers.some((ticker) => typeof ticker !== "string" || !/^\d{6}$/.test(ticker) || !getStock(ticker))) failSnapshot();
      watchlists.set(userId, new Set(tickers));
    }

    const mapFromEntries = (entries, validateKey = () => true, validateValue = () => {}) => {
      if (!Array.isArray(entries)) failSnapshot();
      const map = new Map();
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !validateKey(entry[0]) || map.has(entry[0])) failSnapshot();
        validateValue(entry[1], entry[0]);
        try {
          map.set(entry[0], structuredClone(entry[1]));
        } catch {
          failSnapshot();
        }
      }
      return map;
    };

    const subscriptions = mapFromEntries(snapshot.subscriptions, (userId) => userId.length > 0, (subscription) => validateSubscriptionSnapshot(subscription));
    const idempotency = mapFromEntries(snapshot.idempotency, (key) => key.length > 0, (record) => {
      if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.fingerprint !== "string" || record.fingerprint.length < 1 || !("result" in record) || record.result === undefined) failSnapshot();
    });
    const streamSequence = mapFromEntries(snapshot.streamSequence, (streamKey) => SIGNAL_STREAM_PATTERN.test(streamKey), (sequence) => {
      if (!isSafeNonNegativeInteger(sequence)) failSnapshot();
    });
    const validateStreamKey = (streamKey) => SIGNAL_STREAM_PATTERN.test(streamKey);
    const streamEvents = mapFromEntries(snapshot.streamEvents, validateStreamKey, (events, streamKey) => validateSignalList(events, streamKey));
    const signalHistory = mapFromEntries(snapshot.signalHistory, validateStreamKey, (events, streamKey) => validateSignalList(events, streamKey));
    const signalCurrent = mapFromEntries(snapshot.signalCurrent, validateStreamKey, (signal, streamKey) => validateSignalSnapshot(signal, streamKey));
    const signalRevisions = mapFromEntries(snapshot.signalRevisions, validateStreamKey, (revisions) => {
      if (!Array.isArray(revisions)) failSnapshot();
      revisions.forEach((revision, index) => {
        validateRevisionSnapshot(revision);
        if (revision.revision !== index + 1) failSnapshot();
      });
    });
    const paymentEvents = mapFromEntries(snapshot.paymentEvents, (key) => key.length > 0, (record) => {
      if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(record.fingerprint) || !record.result || typeof record.result !== "object" || Array.isArray(record.result)) failSnapshot();
    });
    const providerRevisions = mapFromEntries(snapshot.providerRevisions, (key) => key.length > 0, (revision) => {
      if (!isSafeNonNegativeInteger(revision)) failSnapshot();
    });

    const signalKeys = new Set([...signalCurrent.keys(), ...signalHistory.keys(), ...signalRevisions.keys(), ...streamEvents.keys()]);
    for (const streamKey of signalKeys) {
      const current = signalCurrent.get(streamKey);
      const history = signalHistory.get(streamKey);
      const revisions = signalRevisions.get(streamKey);
      if (history && (!current || !isDeepStrictEqual(history.at(-1), current))) failSnapshot();
      if (revisions && history && revisions.length !== history.length) failSnapshot();
      if (revisions && history && revisions.some((revision, index) => revision.eventId !== history[index].eventId)) failSnapshot();
    }
    for (const [streamKey, sequence] of streamSequence) {
      const current = signalCurrent.get(streamKey);
      if (current?.epoch === 1 && sequence < current.sequence) failSnapshot();
      const events = streamEvents.get(streamKey) ?? [];
      const latest = events.at(-1);
      if (latest?.epoch === 1 && sequence < latest.sequence) failSnapshot();
    }

    try {
      this.outbox.restore(snapshot.outbox);
    } catch {
      failSnapshot();
    }

    this.watchlists = watchlists;
    this.subscriptions = subscriptions;
    this.idempotency = idempotency;
    this.streamSequence = streamSequence;
    this.streamEvents = streamEvents;
    this.signalHistory = signalHistory;
    this.signalCurrent = signalCurrent;
    this.signalRevisions = signalRevisions;
    this.paymentEvents = paymentEvents;
    this.providerRevisions = providerRevisions;
    return this.snapshot();
  }

  getUserWatchlist(userId) {
    if (!this.watchlists.has(userId)) this.watchlists.set(userId, new Set());
    return this.watchlists.get(userId);
  }

  getIdempotentResult(key, fingerprint) {
    const record = this.idempotency.get(key);
    if (!record) return null;
    if (record.fingerprint !== fingerprint) {
      const error = new Error("IDEMPOTENCY_CONFLICT");
      error.code = "IDEMPOTENCY_CONFLICT";
      throw error;
    }
    return structuredClone(record.result);
  }

  rememberIdempotentResult(key, fingerprint, result) {
    this.idempotency.set(key, { fingerprint, result: structuredClone(result) });
    return structuredClone(result);
  }

  addWatchlistItem(userId, ticker, idempotencyKey) {
    const key = `watchlist:add:${userId}:${idempotencyKey}`;
    const replay = this.getIdempotentResult(key, ticker);
    if (replay) return replay;
    const items = this.getUserWatchlist(userId);
    const duplicate = items.has(ticker);
    items.add(ticker);
    const result = { watchlistId: `watchlist-${userId}`, ticker, created: !duplicate, duplicate };
    return this.rememberIdempotentResult(key, ticker, result);
  }

  removeWatchlistItem(userId, ticker, idempotencyKey) {
    const key = `watchlist:remove:${userId}:${idempotencyKey}`;
    const replay = this.getIdempotentResult(key, ticker);
    if (replay) return replay;
    const removed = this.getUserWatchlist(userId).delete(ticker);
    const result = { watchlistId: `watchlist-${userId}`, ticker, removed };
    return this.rememberIdempotentResult(key, ticker, result);
  }

  listWatchlist(userId, marketProvider = null) {
    return [...this.getUserWatchlist(userId)].map((ticker) => {
      const stock = marketProvider ? marketProvider.getStock(ticker) : getStock(ticker);
      const quote = marketProvider ? marketProvider.getQuote(ticker) : makeQuote(ticker);
      return { ...stock, quote };
    });
  }

  getSubscription(userId, role = "member") {
    if (role === "subscriber" && !this.subscriptions.has(userId)) {
      this.subscriptions.set(userId, { status: "ACTIVE", statusRevision: 1, startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), autoRenew: true, source: "demo-session-entitlement" });
    }
    let subscription = this.subscriptions.get(userId);
    if (subscription?.status === "PENDING" && Date.now() >= subscription.activateAt) {
      subscription = transitionSubscription(subscription, "ACTIVE", { startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
      delete subscription.activateAt;
      this.subscriptions.set(userId, subscription);
    }
    if (subscription && (subscription.status === "ACTIVE" || subscription.status === "CANCELLATION_SCHEDULED") && subscription.endsAt && Date.now() >= Date.parse(subscription.endsAt)) {
      subscription = transitionSubscription(subscription, "EXPIRED", { autoRenew: false });
      this.subscriptions.set(userId, subscription);
    }
    return subscription ? { ...subscription } : { status: "EXPIRED", autoRenew: false, source: "demo-fixture" };
  }

  checkout(userId, idempotencyKey) {
    const key = `checkout:${userId}:${idempotencyKey}`;
    const replay = this.getIdempotentResult(key, "ALGORITHM_SIGNAL_MONTHLY");
    if (replay) return replay;
    const current = this.getSubscription(userId);
    if (["ACTIVE", "PENDING", "SUSPENDED"].includes(current.status)) return current;
    const result = { status: "PENDING", statusRevision: 1, autoRenew: true, provider: "sandbox", activateAt: Date.now() + 1_500 };
    this.subscriptions.set(userId, result);
    return this.rememberIdempotentResult(key, "ALGORITHM_SIGNAL_MONTHLY", result);
  }

  cancel(userId, idempotencyKey) {
    const key = `cancel:${userId}:${idempotencyKey}`;
    const replay = this.getIdempotentResult(key, "cancel");
    if (replay) return replay;
    const current = this.getSubscription(userId);
    if (current.status !== "ACTIVE") return current;
    const result = transitionSubscription(current, "CANCELLATION_SCHEDULED", { cancelAt: current.endsAt, autoRenew: false });
    this.subscriptions.set(userId, result);
    return this.rememberIdempotentResult(key, "cancel", result);
  }

  applyPaymentWebhook(event) {
    const eventKey = `${event.provider}:${event.providerEventId}`;
    const fingerprint = paymentEventFingerprint(event);
    const previousRecord = this.paymentEvents.get(eventKey);
    if (previousRecord) {
      const previousResult = previousRecord.result || previousRecord;
      if (previousRecord.fingerprint && previousRecord.fingerprint !== fingerprint) {
        const error = new Error("PAYMENT_EVENT_CONFLICT");
        error.code = "PAYMENT_EVENT_CONFLICT";
        throw error;
      }
      return { ...previousResult, duplicate: true };
    }

    const userId = event.userId;
    const providerRevisionKey = `${event.provider}:${userId}`;
    const revision = Number(event.revision);
    const lastRevision = this.providerRevisions.get(providerRevisionKey) ?? 0;
    if (!Number.isInteger(revision) || revision < 1) {
      const result = { provider: event.provider, providerEventId: event.providerEventId, applied: false, reason: "INVALID_REVISION" };
      this.paymentEvents.set(eventKey, { fingerprint, result });
      return result;
    }
    if (revision <= lastRevision) {
      const result = { provider: event.provider, providerEventId: event.providerEventId, applied: false, reason: "STALE_PROVIDER_EVENT", currentRevision: lastRevision };
      this.paymentEvents.set(eventKey, { fingerprint, result });
      return result;
    }

    let subscription = this.getSubscription(userId, "member");
    if (!this.subscriptions.has(userId)) {
      subscription = { status: "PENDING", statusRevision: 1, autoRenew: true, provider: event.provider };
      this.subscriptions.set(userId, subscription);
    }

    const patches = { provider: event.provider, providerRevision: revision };
    let next = subscription.status;
    switch (event.eventType) {
      case "payment.succeeded":
        next = ["PENDING", "PAYMENT_FAILED", "CANCELLATION_SCHEDULED", "REFUND_PENDING", "SUSPENDED"].includes(subscription.status) ? "ACTIVE" : subscription.status;
        patches.startedAt = subscription.startedAt || new Date().toISOString();
        patches.endsAt = event.endsAt || subscription.endsAt || new Date(Date.now() + 30 * 86_400_000).toISOString();
        patches.autoRenew = true;
        break;
      case "payment.failed":
        next = subscription.status === "PENDING" ? "PAYMENT_FAILED" : subscription.status;
        patches.failureReason = event.failureReason || "provider_declined";
        patches.autoRenew = false;
        break;
      case "subscription.cancelled":
        next = subscription.status === "ACTIVE" ? "CANCELLATION_SCHEDULED" : subscription.status;
        patches.cancelAt = event.cancelAt || subscription.endsAt;
        patches.autoRenew = false;
        break;
      case "refund.pending":
        next = subscription.status === "ACTIVE" || subscription.status === "CANCELLATION_SCHEDULED" ? "REFUND_PENDING" : subscription.status;
        break;
      case "refund.completed":
        next = subscription.status === "REFUND_PENDING" ? "REFUNDED" : subscription.status;
        patches.autoRenew = false;
        break;
      case "subscription.suspended":
        next = subscription.status === "ACTIVE" ? "SUSPENDED" : subscription.status;
        patches.autoRenew = false;
        break;
      case "subscription.expired":
        next = ["PENDING", "ACTIVE", "CANCELLATION_SCHEDULED", "SUSPENDED"].includes(subscription.status) ? "EXPIRED" : subscription.status;
        patches.autoRenew = false;
        break;
      default:
        next = subscription.status;
    }

    let updated = subscription;
    if (next !== subscription.status) updated = transitionSubscription(subscription, next, patches);
    else updated = { ...subscription, ...patches };
    delete updated.activateAt;
    this.subscriptions.set(userId, updated);
    this.providerRevisions.set(providerRevisionKey, revision);
    const result = { provider: event.provider, providerEventId: event.providerEventId, applied: true, status: updated.status, revision };
    this.paymentEvents.set(eventKey, { fingerprint, result });
    return result;
  }

  nextStreamCursor(ticker) {
    const streamKey = `signal:${ticker}:default`;
    const sequence = (this.streamSequence.get(streamKey) ?? 100) + 1;
    this.streamSequence.set(streamKey, sequence);
    return { streamKey, epoch: 1, sequence };
  }

  currentStreamCursor(ticker) {
    const streamKey = `signal:${ticker}:default`;
    return { streamKey, epoch: 1, sequence: this.streamSequence.get(streamKey) ?? 100 };
  }

  seedCurrentSignal(ticker, event) {
    const validation = validateSignalEvent(event);
    if (!validation.ok || event.ticker !== ticker || event.streamKey !== `signal:${ticker}:default`) {
      const error = new Error("INVALID_SIGNAL_CURRENT");
      error.code = "INVALID_SIGNAL_EVENT";
      throw error;
    }
    const streamKey = `signal:${ticker}:default`;
    const existing = this.signalCurrent.get(streamKey);
    if (existing) return structuredClone(existing);
    const snapshot = structuredClone(event);
    this.signalCurrent.set(streamKey, snapshot);
    this.signalHistory.set(streamKey, [structuredClone(snapshot)]);
    this.signalRevisions.set(streamKey, [{
      revision: 1,
      eventId: snapshot.eventId,
      inputAsOf: snapshot.asOf,
      algorithmVersion: snapshot.algorithmVersion,
      evaluationStatus: snapshot.effectiveStatus ?? snapshot.status,
      evidenceSnapshot: structuredClone(snapshot.evidence),
      createdAt: snapshot.publishedAt,
    }]);
    if (snapshot.epoch === 1) this.streamSequence.set(streamKey, Math.max(this.streamSequence.get(streamKey) ?? 100, snapshot.sequence));
    return structuredClone(snapshot);
  }

  getCurrentSignal(ticker) {
    const signal = this.signalCurrent.get(`signal:${ticker}:default`);
    return signal ? structuredClone(signal) : null;
  }

  listSignalRevisions(ticker) {
    return structuredClone(this.signalRevisions.get(`signal:${ticker}:default`) ?? []);
  }

  listSignalEvents(ticker) {
    return structuredClone(this.signalHistory.get(`signal:${ticker}:default`) ?? []);
  }

  appendStreamEvent(ticker, event) {
    const validation = validateSignalEvent(event);
    if (!validation.ok) {
      const error = new Error(validation.message);
      error.code = "INVALID_SIGNAL_EVENT";
      error.details = validation.details;
      throw error;
    }
    const streamKey = `signal:${ticker}:default`;
    if (event.streamKey !== streamKey || event.ticker !== ticker) {
      const error = new Error("SIGNAL_STREAM_SCOPE_CONFLICT");
      error.code = "INVALID_SIGNAL_EVENT";
      throw error;
    }
    const events = this.streamEvents.get(streamKey) ?? [];
    const outboxRecord = this.outbox.get(event.eventId);
    if (outboxRecord) {
      const same = outboxRecord.aggregateType === "signal"
        && outboxRecord.aggregateId === ticker
        && outboxRecord.streamKey === streamKey
        && isDeepStrictEqual(outboxRecord.payload, event);
      if (!same) {
        const error = new Error("SIGNAL_EVENT_CONFLICT");
        error.code = "SIGNAL_EVENT_CONFLICT";
        throw error;
      }
      return structuredClone(event);
    }
    const duplicate = events.find((candidate) => candidate.eventId === event.eventId);
    if (duplicate) return structuredClone(event);
    const sameCursor = events.find((candidate) => candidate.epoch === event.epoch && candidate.sequence === event.sequence);
    if (sameCursor) {
      const error = new Error("SIGNAL_CURSOR_CONFLICT");
      error.code = "SIGNAL_CURSOR_CONFLICT";
      throw error;
    }
    const latest = events.at(-1);
    if (latest && compareCursor(event, latest) !== null && compareCursor(event, latest) <= 0) {
      const error = new Error("SIGNAL_CURSOR_REVERSE");
      error.code = "SIGNAL_CURSOR_REVERSE";
      throw error;
    }
    const current = this.signalCurrent.get(streamKey);
    if (current && Date.parse(event.asOf) < Date.parse(current.asOf)) {
      const error = new Error("SIGNAL_INPUT_REVERSE");
      error.code = "SIGNAL_INPUT_REVERSE";
      throw error;
    }
    this.outbox.enqueue({ eventId: event.eventId, aggregateType: "signal", aggregateId: ticker, streamKey, payload: event });
    events.push(structuredClone(event));
    if (events.length > 50) events.splice(0, events.length - 50);
    this.streamEvents.set(streamKey, events);
    const history = this.signalHistory.get(streamKey) ?? [];
    history.push(structuredClone(event));
    this.signalHistory.set(streamKey, history);
    this.signalCurrent.set(streamKey, structuredClone(event));
    const revisions = this.signalRevisions.get(streamKey) ?? [];
    revisions.push({
      revision: revisions.length + 1,
      eventId: event.eventId,
      inputAsOf: event.asOf,
      algorithmVersion: event.algorithmVersion,
      evaluationStatus: event.effectiveStatus ?? event.status,
      evidenceSnapshot: structuredClone(event.evidence),
      createdAt: event.publishedAt,
    });
    this.signalRevisions.set(streamKey, revisions);
    if (event.epoch === 1) this.streamSequence.set(streamKey, Math.max(this.streamSequence.get(streamKey) ?? 100, event.sequence));
    return structuredClone(event);
  }

  markStreamEventPublished(eventId) {
    return this.outbox.markPublished(eventId);
  }

  replayStream(streamKey, epoch, afterSequence) {
    const events = this.streamEvents.get(streamKey) ?? [];
    const candidates = events.filter((event) => event.epoch === epoch && event.sequence > afterSequence).sort((left, right) => left.sequence - right.sequence);
    const current = this.signalCurrent.get(streamKey);
    const isCurrentCursor = current?.epoch === epoch && current.sequence === afterSequence;
    const contiguous = isCurrentCursor || (candidates.length > 0 && candidates.every((event, index) => event.sequence === afterSequence + index + 1));
    return {
      replayable: contiguous,
      events: contiguous ? candidates : [],
      resyncReason: contiguous ? undefined : "REPLAY_RETENTION_OR_GAP",
    };
  }
}

export function getDemoUserId(request) {
  const fromHeader = request.headers?.get?.("x-demo-user-id") || request.headers?.["x-demo-user-id"];
  const fromQuery = request.url ? new URL(request.url, "http://localhost").searchParams.get("userId") : null;
  return fromHeader || fromQuery || DEMO_USER_ID;
}

export function getDemoRole(request) {
  const fromHeader = request.headers?.get?.("x-demo-role") || request.headers?.["x-demo-role"];
  const fromQuery = request.url ? new URL(request.url, "http://localhost").searchParams.get("role") : null;
  const role = fromHeader || fromQuery;
  return role === "guest" || role === "member" || role === "subscriber" ? role : "guest";
}

export function ensureKnownTicker(ticker) {
  return Boolean(getStock(ticker));
}

export function defaultWatchlistForDemo(store) {
  const list = store.getUserWatchlist(DEMO_USER_ID);
  if (list.size === 0) list.add(PRIMARY_TICKER);
}
