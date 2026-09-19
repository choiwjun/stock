import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 4900 + Math.floor(Math.random() * 80);
const baseUrl = `http://127.0.0.1:${port}`;

test("production keeps the sandbox payment adapter closed even when a secret exists", async () => {
  const serverProcess = spawn(process.execPath, ["src/app/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: "production", APP_ORIGIN: "https://app.example", INTERNAL_METRICS_TOKEN: "metrics", PAYMENT_WEBHOOK_SECRET: "configured-but-sandbox" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("production provider-gate startup timeout")), 5_000);
      const onData = (chunk) => {
        if (chunk.toString().includes(`:${port}`)) {
          clearTimeout(timeout);
          resolve();
        }
      };
      serverProcess.stdout.on("data", onData);
      serverProcess.once("error", reject);
    });

    const readiness = await fetch(`${baseUrl}/readyz`);
    const readinessBody = await readiness.json();
    assert.equal(readiness.status, 503);
    assert.equal(readinessBody.checks.paymentWebhook.configured, true);
    assert.equal(readinessBody.checks.paymentWebhook.status, "not_ready");
    assert.ok(readinessBody.reasons.includes("PAYMENT_PROVIDER_SANDBOX"));

    const body = JSON.stringify({ provider: "sandbox", providerEventId: "production-provider-gate", userId: "user", revision: 1, eventType: "payment.succeeded" });
    const signature = createHmac("sha256", "configured-but-sandbox").update(body).digest("hex");
    const webhook = await fetch(`${baseUrl}/api/v1/webhooks/payment`, { method: "POST", headers: { "content-type": "application/json", "x-payment-signature": `sha256=${signature}` }, body });
    const webhookBody = await webhook.json();
    assert.equal(webhook.status, 503);
    assert.equal(webhookBody.error.code, "PAYMENT_PROVIDER_SANDBOX");
  } finally {
    if (serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await once(serverProcess, "exit");
    }
  }
});
