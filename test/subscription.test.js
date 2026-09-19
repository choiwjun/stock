import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionSubscription, entitlementForSubscription, transitionSubscription } from "../src/domain/subscription.js";

test("subscription transition table allows only documented lifecycle changes", () => {
  assert.equal(canTransitionSubscription("PENDING", "ACTIVE"), true);
  assert.equal(canTransitionSubscription("ACTIVE", "CANCELLATION_SCHEDULED"), true);
  assert.equal(canTransitionSubscription("REFUNDED", "ACTIVE"), false);
  assert.throws(() => transitionSubscription({ status: "REFUNDED" }, "ACTIVE"), { code: "INVALID_SUBSCRIPTION_TRANSITION" });
});

test("entitlement follows status and end time, not the payment redirect", () => {
  const pending = entitlementForSubscription({ status: "PENDING" });
  const active = entitlementForSubscription({ status: "ACTIVE", endsAt: new Date(Date.now() + 60_000).toISOString() });
  const expired = entitlementForSubscription({ status: "ACTIVE", endsAt: new Date(Date.now() - 60_000).toISOString() });

  assert.equal(pending.status, "INACTIVE");
  assert.equal(active.status, "ACTIVE");
  assert.equal(expired.status, "INACTIVE");
});
