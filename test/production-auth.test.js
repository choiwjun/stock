import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 4800 + Math.floor(Math.random() * 100);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;

before(async () => {
  serverProcess = spawn(process.execPath, ["src/app/server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: "production", APP_ORIGIN: "https://app.example", INTERNAL_METRICS_TOKEN: "   ", PAYMENT_WEBHOOK_SECRET: "" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("production server startup timeout")), 5_000);
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

test("production rejects sandbox session creation and ignores demo role headers", async () => {
  const readiness = await fetch(`${baseUrl}/readyz`);
  const readinessBody = await readiness.json();
  assert.equal(readiness.status, 503);
  assert.equal(readinessBody.status, "not_ready");
  assert.deepEqual(readinessBody.reasons, ["AUTH_PROVIDER_SANDBOX", "MARKET_PROVIDER_SANDBOX", "PAYMENT_WEBHOOK_NOT_CONFIGURED", "METRICS_NOT_CONFIGURED"]);
  assert.equal(readinessBody.checks.authProvider.status, "not_ready");
  assert.equal(readinessBody.checks.paymentWebhook.status, "not_ready");
  assert.equal(readinessBody.checks.metrics.status, "not_ready");
  assert.equal(readinessBody.checks.metrics.configured, false);
  assert.equal(readinessBody.checks.outboxWorker.active, true);
  assert.equal(readinessBody.checks.outboxWorker.inFlight, 0);
  assert.equal(readinessBody.checks.outboxWorker.consecutiveFailures, 0);

  const metrics = await fetch(`${baseUrl}/internal/metrics`);
  const metricsBody = await metrics.json();
  assert.equal(metrics.status, 503);
  assert.equal(metricsBody.error.code, "METRICS_NOT_CONFIGURED");

  const login = await fetch(`${baseUrl}/api/v1/auth/demo/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "production-user" }) });
  assert.equal(login.status, 404);

  const signal = await fetch(`${baseUrl}/api/v1/stocks/005930/signals?role=subscriber`, { headers: { "x-demo-role": "subscriber", "x-demo-user-id": "production-user" } });
  const body = await signal.json();
  assert.equal(signal.status, 200);
  assert.equal(body.locked, true);
  assert.equal(signal.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");

  const localOrigin = await fetch(`${baseUrl}/api/v1/market/overview`, { headers: { origin: `http://localhost:${port}` } });
  assert.equal(localOrigin.status, 403);
});

test("production fails closed when payment webhook verification is not configured", async () => {
  const response = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-payment-signature": "sha256=demo" },
    body: JSON.stringify({ provider: "sandbox", providerEventId: "production-config-check", userId: "user", revision: 1, eventType: "payment.succeeded" }),
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PAYMENT_NOT_CONFIGURED");
});
