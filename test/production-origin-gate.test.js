import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 4980 + Math.floor(Math.random() * 15);
const baseUrl = `http://127.0.0.1:${port}`;

test("production readiness fails closed when the Origin allowlist is missing", async () => {
  const serverProcess = spawn(process.execPath, ["src/app/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: "production", APP_ORIGIN: "", INTERNAL_METRICS_TOKEN: "metrics", PAYMENT_WEBHOOK_SECRET: "configured-secret" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("production origin-gate startup timeout")), 5_000);
      const onData = (chunk) => {
        if (chunk.toString().includes(`:${port}`)) {
          clearTimeout(timeout);
          resolve();
        }
      };
      serverProcess.stdout.on("data", onData);
      serverProcess.once("error", reject);
    });

    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.checks.originAllowlist.status, "not_ready");
    assert.equal(body.checks.originAllowlist.configured, false);
    assert.equal(body.checks.metrics.status, "ready");
    assert.equal(body.checks.metrics.configured, true);
    assert.ok(body.reasons.includes("ORIGIN_NOT_CONFIGURED"));
  } finally {
    if (serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await once(serverProcess, "exit");
    }
  }
});
