import test from "node:test";
import assert from "node:assert/strict";
import { shouldRevokeEntitlement } from "../src/domain/subscription.js";

test("revoke policy treats expired and refunded entitlements as deny states", () => {
  assert.equal(shouldRevokeEntitlement("EXPIRED"), true);
  assert.equal(shouldRevokeEntitlement("REFUNDED"), true);
  assert.equal(shouldRevokeEntitlement("PAYMENT_FAILED"), true);
  assert.equal(shouldRevokeEntitlement("SUSPENDED"), true);
  assert.equal(shouldRevokeEntitlement("ACTIVE"), false);
});
