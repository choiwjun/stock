import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function deriveCsrfToken(token, secret) {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name && value) cookies.set(name, value);
  }
  return cookies;
}

export function sessionCookieName({ production = false } = {}) {
  return production ? "__Host-stock_session" : "stock_session";
}

export function serializeSessionCookie(token, { production = false, maxAge = Math.floor(SESSION_TTL_MS / 1_000) } = {}) {
  const secure = production ? "; Secure" : "";
  return `${sessionCookieName({ production })}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure}`;
}

export class SessionStore {
  constructor({ now = () => Date.now(), ttlMs = SESSION_TTL_MS, csrfSecret = randomBytes(32).toString("base64url") } = {}) {
    this.now = now;
    this.ttlMs = ttlMs;
    this.csrfSecret = csrfSecret;
    this.sessions = new Map();
  }

  publicSession(session, token) {
    const csrfToken = deriveCsrfToken(token, this.csrfSecret);
    if (!safeEqual(hashToken(csrfToken), session.csrfTokenHash)) return null;
    return { ...session, tokenHash: undefined, csrfTokenHash: undefined, csrfToken };
  }

  sweep() {
    const currentTime = this.now();
    for (const [tokenHash, session] of this.sessions) {
      if (session.expiresAt <= currentTime || session.revokedAt) this.sessions.delete(tokenHash);
    }
  }

  create({ userId, role = "member", provider = "sandbox", providerSubject = userId }) {
    this.sweep();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const csrfToken = deriveCsrfToken(token, this.csrfSecret);
    const createdAt = this.now();
    const session = {
      id: `sess_${randomUUID().replaceAll("-", "")}`,
      userId,
      role,
      provider,
      providerSubject,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      lastSeenAt: createdAt,
      csrfTokenHash: hashToken(csrfToken),
      tokenHash,
    };
    this.sessions.set(tokenHash, session);
    return { token, session: this.publicSession(session, token) };
  }

  get(token) {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = this.sessions.get(tokenHash);
    const currentTime = this.now();
    if (!session || session.revokedAt || session.expiresAt <= currentTime) {
      if (session) this.sessions.delete(tokenHash);
      return null;
    }
    session.lastSeenAt = currentTime;
    const publicSession = this.publicSession(session, token);
    if (!publicSession) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return publicSession;
  }

  getFromRequest(request, { production = false } = {}) {
    const cookie = parseCookies(request.headers?.cookie || "").get(sessionCookieName({ production }));
    return cookie ? this.get(decodeCookieValue(cookie)) : null;
  }

  revoke(token) {
    if (!token) return false;
    const tokenHash = hashToken(token);
    const session = this.sessions.get(tokenHash);
    if (!session) return false;
    session.revokedAt = this.now();
    this.sessions.delete(tokenHash);
    return true;
  }

  revokeFromRequest(request, { production = false } = {}) {
    const cookie = parseCookies(request.headers?.cookie || "").get(sessionCookieName({ production }));
    return cookie ? this.revoke(decodeCookieValue(cookie)) : false;
  }

  rotateFromRequest(request, values, options = {}) {
    this.revokeFromRequest(request, options);
    return this.create(values);
  }

  verifyCsrf(request, session) {
    const candidate = request.headers?.["x-csrf-token"];
    return Boolean(candidate) && Boolean(session?.csrfToken) && safeEqual(candidate, session.csrfToken);
  }

  size() {
    this.sweep();
    return this.sessions.size;
  }
}
