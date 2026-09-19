import test from "node:test";
import assert from "node:assert/strict";
import { measureHttp } from "../scripts/measure-demo.js";

test("demo measurement reports bounded latency percentiles and status distribution", async () => {
  let calls = 0;
  const result = await measureHttp({
    baseUrl: "http://example.test",
    path: "/healthz",
    requests: 5,
    concurrency: 2,
    fetchImpl: async () => {
      calls += 1;
      return { status: calls === 4 ? 503 : 200, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  assert.equal(calls, 5);
  assert.equal(result.requests, 5);
  assert.deepEqual(result.statuses, { "200": 4, "503": 1 });
  assert.ok(result.latencyMs.p50 >= 0);
  assert.ok(result.latencyMs.p95 >= result.latencyMs.p50);
  assert.ok(result.latencyMs.p99 >= result.latencyMs.p95);
  assert.ok(result.latencyMs.max >= result.latencyMs.p99);
});

test("demo measurement rejects unsafe or impractical measurement sizes", async () => {
  await assert.rejects(() => measureHttp({ baseUrl: "http://example.test", path: "healthz" }), /PATH_REQUIRED/);
  await assert.rejects(() => measureHttp({ baseUrl: "http://example.test", path: "/healthz", requests: 0 }), /REQUESTS_OUT_OF_RANGE/);
  await assert.rejects(() => measureHttp({ baseUrl: "http://example.test", path: "/healthz", requests: 2, concurrency: 3 }), /CONCURRENCY_OUT_OF_RANGE/);
});
