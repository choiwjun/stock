import test from "node:test";
import assert from "node:assert/strict";
import { MetricsRegistry, normalizeRouteLabel } from "../src/application/metrics.js";

test("route labels stay bounded for dynamic and unknown paths", () => {
  assert.equal(normalizeRouteLabel("/api/v1/stocks/005930/quote"), "/api/v1/stocks/:ticker/quote");
  assert.equal(normalizeRouteLabel("/api/v1/watchlists/watchlist-user/items/005930"), "/api/v1/watchlists/:watchlistId/items/:ticker");
  assert.equal(normalizeRouteLabel("/api/v1/unknown/user-supplied-value"), "api:unmatched");
  assert.equal(normalizeRouteLabel("/styles.css"), "static");
});

test("metrics keep low-cardinality counters and timing observations", () => {
  const metrics = new MetricsRegistry({ now: () => 1_700_000_000_000 });
  metrics.increment("http_requests_total", { method: "GET", path: "/api/v1/market/overview", status: 200 });
  metrics.observe("http_request_duration_ms", 12, { path: "/api/v1/market/overview" });
  metrics.observe("http_request_duration_ms", 18, { path: "/api/v1/market/overview" });

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.counters['http_requests_total{method="GET",path="/api/v1/market/overview",status="200"}'], 1);
  assert.equal(snapshot.observations['http_request_duration_ms{path="/api/v1/market/overview"}'].count, 2);
  assert.match(metrics.toPrometheus(), /http_request_duration_ms_sum\{path="\/api\/v1\/market\/overview"\} 30/);
});

test("metrics expose bounded percentile observations for latency gates", () => {
  const metrics = new MetricsRegistry({ maxSamples: 3 });
  for (const value of [10, 20, 30, 40]) metrics.observe("stream_latency_ms", value, { transport: "sse" });
  const observation = metrics.snapshot().observations['stream_latency_ms{transport="sse"}'];
  assert.equal(observation.count, 4);
  assert.equal(observation.p50, 30);
  assert.equal(observation.p95, 40);
  assert.equal(observation.p99, 40);
  assert.match(metrics.toPrometheus(), /stream_latency_ms_p95\{transport="sse"\} 40/);
});
