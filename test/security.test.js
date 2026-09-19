import test from "node:test";
import assert from "node:assert/strict";
import { FixedWindowRateLimiter, isAllowedOrigin, normalizeOrigin, normalizeRequestId, securityHeaders } from "../src/application/security.js";

test("origin and request id checks fail closed for untrusted values", () => {
  const allowed = new Set(["http://localhost:4173"]);
  assert.equal(isAllowedOrigin(undefined, allowed), true);
  assert.equal(isAllowedOrigin("http://localhost:4173", allowed), true);
  assert.equal(isAllowedOrigin("https://attacker.example", allowed), false);
  assert.equal(isAllowedOrigin("http://localhost:4173", new Set()), false);
  assert.equal(normalizeOrigin("https://app.example/"), "https://app.example");
  assert.equal(normalizeOrigin("https://app.example/path"), null);
  assert.equal(normalizeOrigin("javascript:alert(1)"), null);
  assert.equal(normalizeRequestId("client.req-1", "generated"), "client.req-1");
  assert.equal(normalizeRequestId("bad value", "generated"), "generated");
});

test("rate limiter enforces a fixed window", () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter({ windowMs: 100, max: 2, now: () => now });
  assert.equal(limiter.consume("ip").allowed, true);
  assert.equal(limiter.consume("ip").allowed, true);
  assert.equal(limiter.consume("ip").allowed, false);
  now = 1_101;
  assert.equal(limiter.consume("ip").allowed, true);
});

test("rate limiter removes expired buckets and bounds unique keys", () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter({ windowMs: 100, max: 2, maxBuckets: 2, now: () => now });
  limiter.consume("first");
  limiter.consume("second");
  assert.equal(limiter.buckets.size, 2);
  limiter.consume("third");
  assert.equal(limiter.buckets.size, 2);
  now = 1_101;
  limiter.consume("fourth");
  assert.equal(limiter.buckets.size, 1);
});

test("security headers include browser isolation defaults", () => {
  const headers = securityHeaders();
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
});
