import test from "node:test";
import assert from "node:assert/strict";
import { classifyFreshness, createMarketProvider, normalizeQuote, ProviderConfigurationError } from "../src/application/market-provider.js";

const now = Date.parse("2026-09-18T00:00:00.000Z");

test("provider freshness classifies realtime, delayed, stale, and invalid data", () => {
  const base = { receivedAt: "2026-09-17T23:59:59.900Z" };
  assert.equal(classifyFreshness({ ...base, asOf: "2026-09-17T23:59:59.500Z", now }), "REALTIME");
  assert.equal(classifyFreshness({ ...base, asOf: "2026-09-17T23:59:40.000Z", now }), "DELAYED");
  assert.equal(classifyFreshness({ ...base, asOf: "2026-09-17T23:57:00.000Z", now }), "STALE");
  assert.equal(classifyFreshness({ ...base, asOf: "2026-09-18T00:00:01.000Z", now }), "UNAVAILABLE");
  assert.equal(classifyFreshness({ ...base, asOf: "2026-09-17T23:59:59.500Z", reportedStatus: "UNKNOWN", now }), "UNAVAILABLE");
});

test("fixture provider exposes only allowlisted common stocks and normalized quotes", () => {
  const provider = createMarketProvider({ kind: "fixture", now: () => Date.now() });
  assert.ok(provider.listStocks().every((stock) => stock.securityType === "COMMON_STOCK"));
  assert.equal(provider.getStock("005930").ticker, "005930");
  assert.equal(provider.getStock("999999"), null);
  assert.throws(() => provider.getQuote("999999"), (error) => error.code === "INSTRUMENT_NOT_SUPPORTED");
  assert.equal(provider.getQuote("005930").dataStatus, "REALTIME");
  assert.equal(provider.getQuote("005930", "STALE").dataStatus, "STALE");
  assert.equal(provider.getMarketOverview().movers[0].quote.dataStatus, "REALTIME");
});

test("provider rejects invalid timestamps instead of presenting a normal quote", () => {
  assert.equal(normalizeQuote({ ticker: "005930", asOf: "bad", receivedAt: "bad", dataStatus: "REALTIME" }, { now }).dataStatus, "UNAVAILABLE");
  assert.equal(classifyFreshness({ asOf: "2026-09-18T00:00:01.000Z", receivedAt: "2026-09-18T00:00:01.100Z", now }), "UNAVAILABLE");
});

test("unsupported provider configuration fails explicitly", () => {
  assert.throws(() => createMarketProvider({ kind: "unapproved-live-provider" }), (error) => error instanceof ProviderConfigurationError && error.code === "PROVIDER_NOT_CONFIGURED");
});
