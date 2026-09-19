import test from "node:test";
import assert from "node:assert/strict";
import { SessionStore, parseCookies, serializeSessionCookie, sessionCookieName } from "../src/application/session.js";

test("session store hashes opaque tokens and expires revoked sessions", () => {
  let now = 1_000;
  const sessions = new SessionStore({ now: () => now, ttlMs: 100 });
  const first = sessions.create({ userId: "user-1" });
  assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(first.session.csrfToken, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(first.session.lastSeenAt, 1_000);
  const storedSession = [...sessions.sessions.values()][0];
  assert.equal("csrfToken" in storedSession, false);
  assert.match(storedSession.csrfTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(sessions.size(), 1);
  now = 1_050;
  assert.equal(sessions.get(first.token).lastSeenAt, 1_050);
  assert.equal(sessions.get(first.token).userId, "user-1");
  assert.equal(sessions.get("not-a-session"), null);

  sessions.revoke(first.token);
  assert.equal(sessions.get(first.token), null);
  const second = sessions.create({ userId: "user-1" });
  now += 101;
  assert.equal(sessions.get(second.token), null);
  assert.equal(sessions.size(), 0);
});

test("session cookies are httpOnly, same-site, and production secure", () => {
  const development = serializeSessionCookie("token", { production: false });
  const production = serializeSessionCookie("token", { production: true });
  const shortLived = serializeSessionCookie("token", { maxAge: 1 });
  assert.match(development, /stock_session=token/);
  assert.match(development, /HttpOnly/);
  assert.match(development, /SameSite=Lax/);
  assert.doesNotMatch(development, /; Secure/);
  assert.match(production, /__Host-stock_session=token/);
  assert.match(production, /; Secure/);
  assert.match(shortLived, /Max-Age=1/);
  assert.equal(parseCookies(`${sessionCookieName()}=abc; other=value`).get("stock_session"), "abc");
});
