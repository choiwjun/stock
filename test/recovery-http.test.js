import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 5000 + Math.floor(Math.random() * 100);
const baseUrl = `http://127.0.0.1:${port}`;

async function startServer(snapshotPath) {
  const child = spawn(process.execPath, ["src/app/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), STORE_SNAPSHOT_PATH: snapshotPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("snapshot server startup timeout")), 5_000);
    const onData = (chunk) => {
      if (chunk.toString().includes(`:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
  });
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}

test("server restores sandbox store state across a real process restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-recovery-http-"));
  const snapshotPath = join(directory, "store.json");
  let first;
  let second;
  try {
    first = await startServer(snapshotPath);
    const add = await fetch(`${baseUrl}/api/v1/watchlists`, {
      method: "POST",
      headers: { "x-demo-role": "member", "x-demo-user-id": "restart-user", "content-type": "application/json", "Idempotency-Key": "restart-watchlist" },
      body: JSON.stringify({ ticker: "005930" }),
    });
    assert.equal(add.status, 201);
    await stopServer(first);
    first = null;

    const persisted = JSON.parse(await readFile(snapshotPath, "utf8"));
    assert.equal(persisted.version, 1);

    second = await startServer(snapshotPath);
    const list = await fetch(`${baseUrl}/api/v1/watchlists`, { headers: { "x-demo-role": "member", "x-demo-user-id": "restart-user" } });
    const body = await list.json();
    assert.equal(list.status, 200);
    assert.deepEqual(body.items.map((item) => item.ticker), ["005930"]);
  } finally {
    await stopServer(second);
    await stopServer(first);
    await rm(directory, { recursive: true, force: true });
  }
});
