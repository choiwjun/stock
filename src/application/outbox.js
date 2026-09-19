import { isDeepStrictEqual } from "node:util";
import { compareCursor } from "../domain/cursor.js";

const OUTBOX_STATUSES = new Set(["PENDING", "PUBLISHED", "FAILED"]);

function copy(value) {
  return structuredClone(value);
}

function streamCursor(record) {
  if (!record?.streamKey || !record.payload || typeof record.payload !== "object") return null;
  if (!Number.isSafeInteger(record.payload.epoch) || record.payload.epoch < 1) return null;
  if (!Number.isSafeInteger(record.payload.sequence) || record.payload.sequence < 0) return null;
  return { streamKey: record.streamKey, epoch: record.payload.epoch, sequence: record.payload.sequence };
}

function hasUnpublishedPredecessor(events, record) {
  const cursor = streamCursor(record);
  if (!cursor) return false;
  for (const candidate of events.values()) {
    if (candidate === record || candidate.streamKey !== record.streamKey || candidate.status === "PUBLISHED") continue;
    const candidateCursor = streamCursor(candidate);
    if (candidateCursor && compareCursor(candidateCursor, cursor) !== null && compareCursor(candidateCursor, cursor) < 0) return true;
  }
  return false;
}

function invalidSnapshot() {
  const error = new Error("INVALID_OUTBOX_SNAPSHOT");
  error.code = "INVALID_OUTBOX_SNAPSHOT";
  return error;
}

export class OutboxQueue {
  constructor({ now = () => Date.now(), retryBaseMs = 1_000, maxAttempts = 5, leaseMs = 30_000 } = {}) {
    this.now = now;
    this.retryBaseMs = retryBaseMs;
    this.maxAttempts = maxAttempts;
    this.leaseMs = leaseMs;
    this.events = new Map();
    this.checkpoints = new Map();
  }

  enqueue({ eventId, aggregateType, aggregateId, streamKey = null, payload }) {
    if (typeof eventId !== "string" || !eventId) throw new Error("OUTBOX_EVENT_ID_REQUIRED");
    const existing = this.events.get(eventId);
    if (existing) {
      const same = existing.aggregateType === aggregateType
        && existing.aggregateId === aggregateId
        && existing.streamKey === streamKey
        && isDeepStrictEqual(existing.payload, payload);
      if (!same) {
        const error = new Error("OUTBOX_EVENT_CONFLICT");
        error.code = "OUTBOX_EVENT_CONFLICT";
        throw error;
      }
      return { ...copy(existing), duplicate: true };
    }
    const record = {
      eventId,
      aggregateType,
      aggregateId,
      streamKey,
      payload: copy(payload),
      status: "PENDING",
      attempt: 0,
      nextAttemptAt: this.now(),
      createdAt: this.now(),
      publishedAt: null,
      lastError: null,
      leasedUntil: null,
    };
    const cursor = streamCursor(record);
    if (cursor) {
      for (const existingRecord of this.events.values()) {
        const existingCursor = streamCursor(existingRecord);
        if (existingCursor && compareCursor(existingCursor, cursor) === 0) {
          const error = new Error("OUTBOX_CURSOR_CONFLICT");
          error.code = "OUTBOX_CURSOR_CONFLICT";
          throw error;
        }
      }
    }
    this.events.set(eventId, record);
    return { ...copy(record), duplicate: false };
  }

  get(eventId) {
    const record = this.events.get(eventId);
    return record ? copy(record) : null;
  }

  checkpointDecision(consumer, cursor) {
    if (!consumer || !cursor?.streamKey || !Number.isSafeInteger(cursor.epoch) || cursor.epoch < 1 || !Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0) return "INVALID";
    const current = this.checkpoints.get(`${consumer}:${cursor.streamKey}`);
    if (!current) return "ADVANCE";
    const comparison = compareCursor(cursor, current);
    if (comparison === null || comparison < 0) return "BLOCKED";
    if (comparison === 0) return "ALREADY";
    if (cursor.epoch === current.epoch && cursor.sequence !== current.sequence + 1) return "BLOCKED";
    return "ADVANCE";
  }

  claimDue(limit = 50, consumer = null) {
    const currentTime = this.now();
    const claimed = [];
    for (const record of this.events.values()) {
      if (claimed.length >= limit) break;
      if (record.status === "PUBLISHED" || record.status === "FAILED") continue;
      if (hasUnpublishedPredecessor(this.events, record)) continue;
      const cursor = streamCursor(record);
      if (consumer && cursor && this.checkpointDecision(consumer, cursor) === "BLOCKED") continue;
      if (record.nextAttemptAt > currentTime || (record.leasedUntil && record.leasedUntil > currentTime)) continue;
      record.leasedUntil = currentTime + this.leaseMs;
      claimed.push(copy(record));
    }
    return claimed;
  }

  markPublished(eventId) {
    const record = this.events.get(eventId);
    if (!record) return null;
    if (record.status !== "PENDING") return copy(record);
    record.status = "PUBLISHED";
    record.publishedAt = this.now();
    record.nextAttemptAt = null;
    record.leasedUntil = null;
    record.lastError = null;
    return copy(record);
  }

  markFailed(eventId, error = "PUBLISH_FAILED") {
    const record = this.events.get(eventId);
    if (!record) return null;
    if (record.status !== "PENDING") return copy(record);
    record.attempt += 1;
    record.lastError = String(error).slice(0, 256);
    record.leasedUntil = null;
    if (record.attempt >= this.maxAttempts) {
      record.status = "FAILED";
      record.nextAttemptAt = null;
    } else {
      record.status = "PENDING";
      record.nextAttemptAt = this.now() + this.retryBaseMs * (2 ** (record.attempt - 1));
    }
    return copy(record);
  }

  advanceCheckpoint(consumer, cursor) {
    if (this.checkpointDecision(consumer, cursor) !== "ADVANCE") return false;
    const key = `${consumer}:${cursor.streamKey}`;
    this.checkpoints.set(key, { consumer, ...copy(cursor), updatedAt: this.now() });
    return true;
  }

  checkpoint(consumer, streamKey) {
    const record = this.checkpoints.get(`${consumer}:${streamKey}`);
    return record ? copy(record) : null;
  }

  snapshot() {
    return {
      events: [...this.events.values()].map(copy),
      checkpoints: [...this.checkpoints.values()].map(copy),
    };
  }

  restore(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.checkpoints)) {
      throw invalidSnapshot();
    }

    const events = new Map();
    const cursorKeys = new Set();
    for (const record of snapshot.events) {
      const validRecord = record
        && typeof record.eventId === "string"
        && record.eventId.length > 0
        && typeof record.aggregateType === "string"
        && record.aggregateType.length > 0
        && typeof record.aggregateId === "string"
        && record.aggregateId.length > 0
        && (record.streamKey === null || typeof record.streamKey === "string")
        && record.payload !== undefined
        && OUTBOX_STATUSES.has(record.status)
        && Number.isInteger(record.attempt)
        && record.attempt >= 0
        && record.attempt <= this.maxAttempts
        && (record.nextAttemptAt === null || Number.isFinite(record.nextAttemptAt))
        && Number.isFinite(record.createdAt)
        && (record.publishedAt === null || Number.isFinite(record.publishedAt))
        && (record.leasedUntil === null || Number.isFinite(record.leasedUntil))
        && (record.lastError === null || (typeof record.lastError === "string" && record.lastError.length <= 256))
        && (record.status !== "FAILED" || record.attempt >= this.maxAttempts)
        && (record.status !== "FAILED" || (record.attempt >= this.maxAttempts && record.nextAttemptAt === null && record.publishedAt === null && record.leasedUntil === null))
        && (record.status !== "PUBLISHED" || (record.publishedAt !== null && record.nextAttemptAt === null && record.leasedUntil === null))
        && (record.status !== "PENDING" || (record.attempt < this.maxAttempts && record.nextAttemptAt !== null && record.publishedAt === null))
        && (record.status !== "FAILED" || record.lastError !== null);
      if (!validRecord || events.has(record.eventId)) throw invalidSnapshot();
      const cursor = streamCursor(record);
      if (cursor) {
        const cursorKey = `${cursor.streamKey}:${cursor.epoch}:${cursor.sequence}`;
        if (cursorKeys.has(cursorKey)) throw invalidSnapshot();
        cursorKeys.add(cursorKey);
      }
      events.set(record.eventId, copy(record));
    }

    for (const record of events.values()) {
      if (record.status === "PUBLISHED" && hasUnpublishedPredecessor(events, record)) throw invalidSnapshot();
    }

    const checkpoints = new Map();
    for (const record of snapshot.checkpoints) {
      if (!record || typeof record.consumer !== "string" || !record.consumer || typeof record.streamKey !== "string" || !record.streamKey || !Number.isSafeInteger(record.epoch) || record.epoch < 1 || !Number.isSafeInteger(record.sequence) || record.sequence < 0 || !Number.isFinite(record.updatedAt)) throw invalidSnapshot();
      const key = `${record.consumer}:${record.streamKey}`;
      if (checkpoints.has(key)) throw invalidSnapshot();
      checkpoints.set(key, copy(record));
    }

    this.events = events;
    this.checkpoints = checkpoints;
    return this.snapshot();
  }
}
