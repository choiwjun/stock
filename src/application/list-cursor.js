import { createHmac, timingSafeEqual } from "node:crypto";

const CURSOR_PREFIX = "lc1";
const DEFAULT_SECRET = "demo-list-cursor-secret";
const CURSOR_SECRET = process.env.CURSOR_SECRET || DEFAULT_SECRET;

function invalidCursor() {
  const error = new Error("INVALID_CURSOR");
  error.code = "INVALID_CURSOR";
  return error;
}

function sign(body) {
  return createHmac("sha256", CURSOR_SECRET).update(body).digest("base64url");
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function createListCursor({ scope, offset, pageSize }) {
  if (typeof scope !== "string" || scope.length < 1 || scope.length > 512 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw invalidCursor();
  const body = encodePayload({ v: 1, scope, offset, pageSize });
  return `${CURSOR_PREFIX}.${body}.${sign(body)}`;
}

export function readListCursor(token, { scope, pageSize }) {
  if (token === undefined || token === null || token === "") return { offset: 0, pageSize };
  if (typeof token !== "string" || token.length > 1_024) throw invalidCursor();
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== CURSOR_PREFIX) throw invalidCursor();
  const [, body, providedSignature] = parts;
  const expectedSignature = sign(body);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw invalidCursor();
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
  if (payload?.v !== 1 || payload.scope !== scope || payload.pageSize !== pageSize || !Number.isInteger(payload.offset) || payload.offset < 0) throw invalidCursor();
  return { offset: payload.offset, pageSize: payload.pageSize };
}

export function paginateList(items, { cursor, scope, pageSize = 50 } = {}) {
  if (!Array.isArray(items)) throw new TypeError("LIST_ITEMS_REQUIRED");
  const position = readListCursor(cursor, { scope, pageSize });
  const page = items.slice(position.offset, position.offset + position.pageSize);
  const nextOffset = position.offset + page.length;
  return {
    items: page,
    nextCursor: nextOffset < items.length ? createListCursor({ scope, offset: nextOffset, pageSize: position.pageSize }) : null,
  };
}
