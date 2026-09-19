import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 4700 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;

before(async () => {
  serverProcess = spawn(process.execPath, ["src/app/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), AUTH_RATE_LIMIT_MAX: "2" },
    stdio: ["ignore", "pipe", "pipe"],
  });
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
    serverProcess.once("exit", (code) => reject(new Error(`server exited before startup: ${code}`)));
  });
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill("SIGTERM");
  await once(serverProcess, "exit");
});

async function request(body) {
  const response = await fetch(`${baseUrl}/api/v1/auth/demo/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test("sandbox login attempts are rate limited and audited", async () => {
  const first = await request({});
  const second = await request({});
  const third = await request({ userId: "should-not-create-session" });

  assert.equal(first.response.status, 400);
  assert.equal(second.response.status, 400);
  assert.equal(third.response.status, 429);
  assert.equal(third.body.error.code, "RATE_LIMITED");
  assert.ok(Number(third.response.headers.get("retry-after")) >= 1);

  const metrics = await fetch(`${baseUrl}/internal/metrics`);
  assert.match(await metrics.text(), /audit_event_total\{action="AUTH_RATE_LIMITED",resource_type="auth_session"\}/);
});
