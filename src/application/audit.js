import { randomUUID } from "node:crypto";

const SENSITIVE_KEY = /(token|secret|cookie|authorization|password|card|cvv|access.?key|refresh)/i;
const MAX_METADATA_VALUE_LENGTH = 256;

function invalidAuditSnapshot() {
  const error = new Error("INVALID_AUDIT_SNAPSHOT");
  error.code = "INVALID_AUDIT_SNAPSHOT";
  return error;
}

function validNullableString(value, maxLength) {
  return value === null || value === undefined || (typeof value === "string" && value.length <= maxLength);
}

function restoreMetadata(metadata) {
  if (metadata === undefined) return {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw invalidAuditSnapshot();
  for (const value of Object.values(metadata)) {
    if (value !== null && typeof value !== "string" && typeof value !== "boolean" && (typeof value !== "number" || !Number.isFinite(value))) throw invalidAuditSnapshot();
    if (typeof value === "string" && value.length > MAX_METADATA_VALUE_LENGTH) throw invalidAuditSnapshot();
  }
  return safeMetadata(metadata);
}

function safeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, value]) => {
    if (value === null || typeof value === "boolean" || typeof value === "number") return [key, value];
    return [key, String(value).slice(0, MAX_METADATA_VALUE_LENGTH)];
  }));
}

export class AuditLog {
  constructor({ now = () => Date.now(), maxEntries = 1_000 } = {}) {
    this.now = now;
    this.maxEntries = maxEntries;
    this.events = [];
  }

  append({ actorType, actorId = null, action, resourceType, resourceId = null, requestId = null, traceId = null, metadata = {} } = {}) {
    if (typeof actorType !== "string" || typeof action !== "string" || typeof resourceType !== "string") throw new TypeError("AUDIT_FIELDS_REQUIRED");
    const event = {
      id: `audit_${randomUUID().replaceAll("-", "")}`,
      actorType: actorType.slice(0, 32),
      actorId: actorId === null ? null : String(actorId).slice(0, 128),
      action: action.slice(0, 96),
      resourceType: resourceType.slice(0, 64),
      resourceId: resourceId === null ? null : String(resourceId).slice(0, 128),
      requestId: requestId === null ? null : String(requestId).slice(0, 80),
      traceId: traceId === null ? null : String(traceId).slice(0, 80),
      metadata: safeMetadata(metadata),
      occurredAt: new Date(this.now()).toISOString(),
    };
    this.events.push(event);
    if (this.events.length > this.maxEntries) this.events.splice(0, this.events.length - this.maxEntries);
    return structuredClone(event);
  }

  snapshot() {
    return structuredClone(this.events);
  }

  restore(events) {
    if (!Array.isArray(events)) throw invalidAuditSnapshot();
    const ids = new Set();
    const restored = events.map((event) => {
      if (!event || typeof event.id !== "string" || event.id.length < 1 || event.id.length > 96 || ids.has(event.id) || typeof event.actorType !== "string" || event.actorType.length < 1 || event.actorType.length > 32 || typeof event.action !== "string" || event.action.length < 1 || event.action.length > 96 || typeof event.resourceType !== "string" || event.resourceType.length < 1 || event.resourceType.length > 64 || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt)) || !validNullableString(event.actorId, 128) || !validNullableString(event.resourceId, 128) || !validNullableString(event.requestId, 80) || !validNullableString(event.traceId, 80)) throw invalidAuditSnapshot();
      ids.add(event.id);
      return {
        id: event.id,
        actorType: event.actorType,
        actorId: event.actorId === null || event.actorId === undefined ? null : event.actorId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId === null || event.resourceId === undefined ? null : event.resourceId,
        requestId: event.requestId === null || event.requestId === undefined ? null : event.requestId,
        traceId: event.traceId === null || event.traceId === undefined ? null : event.traceId,
        metadata: restoreMetadata(event.metadata),
        occurredAt: event.occurredAt,
      };
    });
    this.events = restored.slice(-this.maxEntries);
    return this.snapshot();
  }
}
