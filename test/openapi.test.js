import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("OpenAPI contract covers the planning routes and protected signal fields", async () => {
  const contract = JSON.parse(await readFile(new URL("../contracts/openapi.json", import.meta.url), "utf8"));
  const requiredOperations = {
    "/healthz": ["get"],
    "/readyz": ["get"],
    "/internal/metrics": ["get"],
    "/api/v1/market/overview": ["get"],
    "/api/v1/auth/demo/session": ["post"],
    "/api/v1/auth/me": ["get"],
    "/api/v1/auth/logout": ["post"],
    "/api/v1/stocks/search": ["get"],
    "/api/v1/stocks/{ticker}": ["get"],
    "/api/v1/stocks/{ticker}/quote": ["get"],
    "/api/v1/stocks/{ticker}/chart": ["get"],
    "/api/v1/stocks/{ticker}/flows": ["get"],
    "/api/v1/stocks/{ticker}/news": ["get"],
    "/api/v1/stocks/{ticker}/financials": ["get"],
    "/api/v1/stocks/{ticker}/signals": ["get"],
    "/api/v1/signals": ["get"],
    "/api/v1/screener/conditions": ["get"],
    "/api/v1/screener/query": ["post"],
    "/api/v1/watchlists": ["get", "post"],
    "/api/v1/watchlists/{watchlistId}/items/{ticker}": ["delete"],
    "/api/v1/entitlements/me": ["get"],
    "/api/v1/subscriptions/me": ["get"],
    "/api/v1/subscriptions/checkout": ["post"],
    "/api/v1/subscriptions/cancel": ["post"],
    "/api/v1/webhooks/payment": ["post"],
    "/api/v1/stream": ["get"],
    "/api/v1/stream/replay": ["get"],
  };
  for (const [path, methods] of Object.entries(requiredOperations)) {
    assert.ok(contract.paths[path], `missing ${path}`);
    for (const method of methods) assert.ok(contract.paths[path][method], `missing ${method.toUpperCase()} ${path}`);
  }
  assert.deepEqual(Object.keys(contract.paths).sort(), Object.keys(requiredOperations).sort(), "OpenAPI paths must stay aligned with the approved route set");
  assert.equal(contract.components.securitySchemes.sessionCookie.in, "cookie");
  assert.equal(contract.components.parameters.CsrfToken.name, "x-csrf-token");
  assert.equal(contract.components.parameters.MetricsToken.name, "x-metrics-token");
  assert.equal(contract.components.parameters.CsrfToken.required, false);
  assert.equal(contract.components.parameters.MetricsToken.required, false);
  assert.equal(contract.components.responses.Quote.content["application/json"].schema.$ref, "#/components/schemas/QuoteResponse");
  assert.deepEqual(contract.components.schemas.QuoteResponse.allOf[1].required, ["requestId", "traceId"]);
  assert.deepEqual(contract.components.responses.ScreenerConditions.content["application/json"].schema.required, ["items", "asOf", "dataStatus", "requestId"]);
  assert.deepEqual(contract.components.responses.Entitlements.content["application/json"].schema.required, ["items", "asOf", "requestId"]);
  assert.deepEqual(contract.components.responses.Subscription.content["application/json"].schema.required, ["subscription", "asOf", "requestId"]);
  const memberOperations = [
    ["/api/v1/stocks/{ticker}/flows", "get"],
    ["/api/v1/stocks/{ticker}/financials", "get"],
    ["/api/v1/screener/conditions", "get"],
    ["/api/v1/screener/query", "post"],
    ["/api/v1/watchlists", "get"],
    ["/api/v1/watchlists", "post"],
    ["/api/v1/watchlists/{watchlistId}/items/{ticker}", "delete"],
    ["/api/v1/entitlements/me", "get"],
    ["/api/v1/subscriptions/me", "get"],
    ["/api/v1/subscriptions/checkout", "post"],
    ["/api/v1/subscriptions/cancel", "post"],
  ];
  for (const [path, method] of memberOperations) {
    const security = contract.paths[path][method].security;
    assert.ok(security.some((scheme) => scheme.sessionCookie), `missing session auth for ${method.toUpperCase()} ${path}`);
    assert.ok(security.some((scheme) => scheme.demoMember), `missing sandbox member auth for ${method.toUpperCase()} ${path}`);
  }
  for (const [path, method] of [["/api/v1/screener/query", "post"], ["/api/v1/watchlists", "post"], ["/api/v1/watchlists/{watchlistId}/items/{ticker}", "delete"], ["/api/v1/subscriptions/checkout", "post"], ["/api/v1/subscriptions/cancel", "post"]]) {
    assert.ok(contract.paths[path][method].parameters.some((parameter) => parameter.$ref?.endsWith("/CsrfToken")), `missing conditional CSRF contract for ${method.toUpperCase()} ${path}`);
  }
  assert.deepEqual(contract.components.schemas.Readiness.required, ["status", "mode", "checks", "requestId"]);
  assert.ok(contract.components.schemas.Readiness.properties.checks.required.includes("originAllowlist"));
  assert.ok(contract.components.schemas.Readiness.properties.checks.required.includes("metrics"));
  assert.deepEqual(contract.components.schemas.SignalSnapshot.required, ["snapshotCursor", "item"]);
  assert.equal(contract.components.schemas.Signal.additionalProperties, false);
  assert.equal(contract.components.schemas.SignalHistory.additionalProperties, false);
  assert.deepEqual(contract.components.schemas.SignalHistory.required, ["events", "revisions"]);
  assert.equal(contract.components.responses.SignalEnvelope.content["application/json"].schema.properties.history.$ref, "#/components/schemas/SignalHistory");
  assert.equal(contract.components.responses.Replay.content["application/json"].schema.properties.snapshot.$ref, "#/components/schemas/SignalSnapshot");
  for (const responseName of ["StockSearch", "Flows", "News", "Financials", "SignalEnvelope", "SignalList", "ScreenerResult", "Watchlist"]) {
    const schema = contract.components.responses[responseName].content["application/json"].schema;
    for (const field of ["nextCursor", "asOf", "dataStatus", "requestId"]) assert.ok(schema.required.includes(field), `missing ${responseName}.${field}`);
  }
  assert.equal(contract.components.parameters.ListCursor.in, "query");
  assert.ok(contract.components.responses.SignalEnvelope.content["application/json"].schema.required.includes("asOf"));
  assert.ok(contract.components.responses.SignalEnvelope.content["application/json"].schema.required.includes("dataStatus"));
  assert.deepEqual(contract.components.schemas.Direction.enum, ["BUY", "SELL", "NEUTRAL"]);
  assert.deepEqual(contract.components.schemas.DataStatus.enum, ["REALTIME", "DELAYED", "STALE", "UNAVAILABLE"]);
  for (const field of ["strength", "validUntil", "lastHeartbeatAt", "lastEvaluatedAt", "staleAfter", "healthReason", "riskDisclosureId"]) assert.ok(contract.components.schemas.Signal.required.includes(field), `missing Signal.${field}`);
  const protectedFields = contract.components.schemas.SignalPreview.allOf.map((rule) => rule.not.required[0]);
  assert.deepEqual(protectedFields, ["direction", "strength", "occurredAt", "publishedAt", "algorithmVersion", "evidence"]);
  assert.equal(contract.components.schemas.SignalPreview.additionalProperties, false);
  assert.ok(contract.components.schemas.SignalPreview.properties.source);
});
