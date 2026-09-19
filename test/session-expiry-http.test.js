import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 5200 + Math.floor(Math.random() * 80);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;

before(async () => {
  serverProcess = spawn(process.execPath, ["src/app/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), SESSION_TTL_MS: "100" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("session expiry server startup timeout")), 5_000);
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
  return { response, body: await response.json() };
}

test("expired session denies protected REST and stream requests", async () => {
  const login = await request("/api/v1/auth/demo/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "expiry-user" }),
  });
  assert.equal(login.response.status, 201);
  assert.match(login.response.headers.get("set-cookie"), /Max-Age=1/);
  const cookie = login.response.headers.get("set-cookie").split(";", 1)[0];

  const current = await request("/api/v1/auth/me", { headers: { cookie } });
  assert.equal(current.body.authenticated, true);

  await new Promise((resolve) => setTimeout(resolve, 180));

  const me = await request("/api/v1/auth/me", { headers: { cookie } });
  assert.equal(me.body.authenticated, false);

  const flows = await request("/api/v1/stocks/005930/flows?role=member&userId=expiry-user", { headers: { cookie } });
  assert.equal(flows.response.status, 401);
  assert.equal(flows.body.error.code, "AUTH_REQUIRED");

  const stream = await request("/api/v1/stream?ticker=005930&role=subscriber&userId=expiry-user", { headers: { cookie } });
  assert.equal(stream.response.status, 401);
  assert.equal(stream.body.error.code, "AUTH_REQUIRED");
});
