import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 4600 + Math.floor(Math.random() * 200);
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

test("sandbox login sets a server session and requires CSRF for mutations", async () => {
  const login = await request("/api/v1/auth/demo/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "cookie-user" }) });
  assert.equal(login.response.status, 201);
  assert.equal(login.body.authenticated, true);
  assert.match(login.response.headers.get("set-cookie") || "", /HttpOnly/);
  assert.match(login.response.headers.get("set-cookie") || "", /SameSite=Lax/);
  const cookie = (login.response.headers.get("set-cookie") || "").split(";", 1)[0];
  assert.ok(cookie);

  const me = await request("/api/v1/auth/me", { headers: { cookie } });
  assert.equal(me.response.status, 200);
  assert.deepEqual({ authenticated: me.body.authenticated, userId: me.body.userId, role: me.body.role }, { authenticated: true, userId: "cookie-user", role: "member" });
  assert.equal(me.body.csrfToken, login.body.csrfToken);

  const withoutCsrf = await request("/api/v1/watchlists", { method: "POST", headers: { cookie, "content-type": "application/json", "Idempotency-Key": "cookie-watchlist-1" }, body: JSON.stringify({ ticker: "005930" }) });
  assert.equal(withoutCsrf.response.status, 403);
  assert.equal(withoutCsrf.body.error.code, "CSRF_REQUIRED");

  const withCsrf = await request("/api/v1/watchlists", { method: "POST", headers: { cookie, "x-csrf-token": login.body.csrfToken, "content-type": "application/json", "Idempotency-Key": "cookie-watchlist-1" }, body: JSON.stringify({ ticker: "005930" }) });
  assert.equal(withCsrf.response.status, 201);

  const logout = await request("/api/v1/auth/logout", { method: "POST", headers: { cookie, "x-csrf-token": login.body.csrfToken } });
  assert.equal(logout.response.status, 200);
  const afterLogout = await request("/api/v1/auth/me", { headers: { cookie } });
  assert.equal(afterLogout.body.authenticated, false);

  const staleCookieRole = await request("/api/v1/stocks/005930/flows?role=member&userId=cookie-user", { headers: { cookie } });
  assert.equal(staleCookieRole.response.status, 401);
  assert.equal(staleCookieRole.body.error.code, "AUTH_REQUIRED");

  const staleCookieStream = await fetch(`${baseUrl}/api/v1/stream?ticker=005930&role=subscriber&userId=cookie-user`, { headers: { cookie } });
  assert.equal(staleCookieStream.status, 401);
  const staleCookieStreamBody = await staleCookieStream.json();
  assert.equal(staleCookieStreamBody.error.code, "AUTH_REQUIRED");
});

test("logout revokes an open premium stream before closing it", async () => {
  const login = await request("/api/v1/auth/demo/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "logout-stream-user" }) });
  const cookie = (login.response.headers.get("set-cookie") || "").split(";", 1)[0];
  const csrfToken = login.body.csrfToken;
  const checkout = await request("/api/v1/subscriptions/checkout", { method: "POST", headers: { cookie, "x-csrf-token": csrfToken, "content-type": "application/json", "Idempotency-Key": "logout-stream-checkout" }, body: "{}" });
  assert.equal(checkout.response.status, 202);
  await new Promise((resolve) => setTimeout(resolve, 1_600));

  const streamResponse = await fetch(`${baseUrl}/api/v1/stream?ticker=005930`, { headers: { cookie } });
  assert.equal(streamResponse.status, 200);
  const reader = streamResponse.body.getReader();
  const firstChunk = new TextDecoder().decode((await reader.read()).value);
  assert.match(firstChunk, /event: connection\.ready/);

  const logout = await request("/api/v1/auth/logout", { method: "POST", headers: { cookie, "x-csrf-token": csrfToken } });
  assert.equal(logout.response.status, 200);
  const chunks = [];
  let done = false;
  while (!done && chunks.join("").length < 4_096) {
    const next = await reader.read();
    done = next.done;
    if (next.value) chunks.push(new TextDecoder().decode(next.value));
  }
  const tail = chunks.join("");
  assert.match(tail, /event: entitlement\.revoked/);
  assert.match(tail, /"reason":"LOGOUT"/);
  assert.equal(done, true);
});

test("stream rechecks entitlement and revokes when it becomes inactive", async () => {
  const login = await request("/api/v1/auth/demo/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "recheck-stream-user" }) });
  const cookie = (login.response.headers.get("set-cookie") || "").split(";", 1)[0];
  const csrfToken = login.body.csrfToken;
  await request("/api/v1/subscriptions/checkout", { method: "POST", headers: { cookie, "x-csrf-token": csrfToken, "content-type": "application/json", "Idempotency-Key": "recheck-stream-checkout" }, body: "{}" });
  await new Promise((resolve) => setTimeout(resolve, 1_600));

  const streamResponse = await fetch(`${baseUrl}/api/v1/stream?ticker=005930`, { headers: { cookie } });
  assert.equal(streamResponse.status, 200);
  const reader = streamResponse.body.getReader();
  const firstChunk = new TextDecoder().decode((await reader.read()).value);
  assert.match(firstChunk, /event: connection\.ready/);

  const payload = JSON.stringify({ provider: "sandbox", providerEventId: "recheck-refund-pending", userId: "recheck-stream-user", revision: 1, eventType: "refund.pending" });
  const webhook = await request("/api/v1/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": paymentSignature(payload) }, body: payload });
  assert.equal(webhook.body.result.status, "REFUND_PENDING");

  let streamText = "";
  const deadline = Date.now() + 1_000;
  let done = false;
  while (Date.now() < deadline && !streamText.includes("entitlement.revoked")) {
    const next = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 250))]);
    done = next.done;
    if (next.value) streamText += new TextDecoder().decode(next.value);
    if (done) break;
  }
  await reader.cancel();
  assert.match(streamText, /event: entitlement\.revoked/);
  assert.match(streamText, /"reason":"ENTITLEMENT_INACTIVE"/);
});

test("browser shell imports only public static modules", async () => {
  const app = await fetch(`${baseUrl}/app.js`);
  assert.equal(app.status, 200);
  assert.match(await app.text(), /from ["']\/cursor\.js["']/);
  const cursor = await fetch(`${baseUrl}/cursor.js`);
  assert.equal(cursor.status, 200);
  assert.match(await cursor.text(), /function hasCursorGap/);
});
