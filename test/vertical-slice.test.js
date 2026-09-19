import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 5050 + Math.floor(Math.random() * 80);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;

before(async () => {
  serverProcess = spawn(process.execPath, ["src/app/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), STREAM_TICK_MS: "50" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("vertical slice server startup timeout")), 5_000);
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

test("representative stock vertical slice preserves session and entitlement boundaries", async () => {
  const market = await request("/api/v1/market/overview");
  assert.equal(market.response.status, 200);

  const search = await request(`/api/v1/stocks/search?q=${encodeURIComponent("삼성전자")}`);
  assert.equal(search.response.status, 200);
  assert.equal(search.body.items[0].ticker, "005930");

  const stock = await request("/api/v1/stocks/005930");
  assert.equal(stock.response.status, 200);
  assert.equal(stock.body.quote.ticker, "005930");
  assert.equal(typeof stock.body.quote.receivedAt, "string");

  const locked = await request("/api/v1/stocks/005930/signals");
  assert.equal(locked.response.status, 200);
  assert.equal(locked.body.locked, true);
  assert.equal("direction" in locked.body.item, false);

  const login = await request("/api/v1/auth/demo/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "vertical-slice-user" }),
  });
  assert.equal(login.response.status, 201);
  const cookie = login.response.headers.get("set-cookie").split(";", 1)[0];
  const csrfToken = login.body.csrfToken;
  const sessionHeaders = { cookie };
  const mutationHeaders = { ...sessionHeaders, "x-csrf-token": csrfToken, "content-type": "application/json" };

  const flows = await request("/api/v1/stocks/005930/flows", { headers: sessionHeaders });
  assert.equal(flows.response.status, 200);

  const add = await request("/api/v1/watchlists", {
    method: "POST",
    headers: { ...mutationHeaders, "Idempotency-Key": "vertical-slice-watchlist" },
    body: JSON.stringify({ ticker: "005930" }),
  });
  assert.equal(add.response.status, 201);

  const watchlist = await request("/api/v1/watchlists", { headers: sessionHeaders });
  assert.equal(watchlist.response.status, 200);
  assert.ok(watchlist.body.items.some((item) => item.ticker === "005930"));

  const checkout = await request("/api/v1/subscriptions/checkout", {
    method: "POST",
    headers: { ...mutationHeaders, "Idempotency-Key": "vertical-slice-checkout" },
    body: JSON.stringify({ plan: "ALGORITHM_SIGNAL_MONTHLY" }),
  });
  assert.equal(checkout.response.status, 202);
  assert.equal(checkout.body.subscription.status, "PENDING");

  const lockedWhilePending = await request("/api/v1/stocks/005930/signals", { headers: sessionHeaders });
  assert.equal(lockedWhilePending.body.locked, true);

  await new Promise((resolve) => setTimeout(resolve, 1_650));
  const entitlement = await request("/api/v1/entitlements/me", { headers: sessionHeaders });
  assert.equal(entitlement.response.status, 200);
  assert.equal(entitlement.body.items[0].status, "ACTIVE");

  const premium = await request("/api/v1/stocks/005930/signals", { headers: sessionHeaders });
  assert.equal(premium.response.status, 200);
  assert.equal(premium.body.locked, false);
  assert.equal(premium.body.item.direction, "BUY");
  assert.ok(Array.isArray(premium.body.history.events));
});
