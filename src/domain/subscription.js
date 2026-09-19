export const SUBSCRIPTION_STATUSES = Object.freeze([
  "PENDING",
  "ACTIVE",
  "CANCELLATION_SCHEDULED",
  "REFUND_PENDING",
  "REFUNDED",
  "PAYMENT_FAILED",
  "EXPIRED",
  "SUSPENDED",
]);

const TRANSITIONS = Object.freeze({
  PENDING: ["ACTIVE", "PAYMENT_FAILED", "EXPIRED"],
  ACTIVE: ["CANCELLATION_SCHEDULED", "REFUND_PENDING", "EXPIRED", "SUSPENDED"],
  CANCELLATION_SCHEDULED: ["ACTIVE", "EXPIRED", "REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED", "ACTIVE"],
  REFUNDED: ["EXPIRED"],
  PAYMENT_FAILED: ["ACTIVE", "EXPIRED"],
  EXPIRED: [],
  SUSPENDED: ["ACTIVE", "EXPIRED"],
});

export function canTransitionSubscription(from, to) {
  if (!SUBSCRIPTION_STATUSES.includes(from) || !SUBSCRIPTION_STATUSES.includes(to)) return false;
  return from === to || TRANSITIONS[from].includes(to);
}

export function transitionSubscription(subscription, nextStatus, patch = {}) {
  if (!canTransitionSubscription(subscription.status, nextStatus)) {
    const error = new Error(`Invalid subscription transition: ${subscription.status} -> ${nextStatus}`);
    error.code = "INVALID_SUBSCRIPTION_TRANSITION";
    throw error;
  }
  return {
    ...subscription,
    ...patch,
    status: nextStatus,
    statusRevision: (subscription.statusRevision || 0) + (subscription.status === nextStatus ? 0 : 1),
  };
}

export function entitlementForSubscription(subscription, at = Date.now()) {
  const activeStatus = subscription.status === "ACTIVE" || subscription.status === "CANCELLATION_SCHEDULED";
  const endsAt = subscription.endsAt ? Date.parse(subscription.endsAt) : Number.POSITIVE_INFINITY;
  const active = activeStatus && endsAt > at;
  return {
    capability: "REALTIME_SIGNAL",
    status: active ? "ACTIVE" : "INACTIVE",
    effectiveUntil: active && Number.isFinite(endsAt) ? subscription.endsAt : null,
  };
}

export function shouldRevokeEntitlement(status) {
  return status === "EXPIRED" || status === "REFUNDED" || status === "PAYMENT_FAILED" || status === "SUSPENDED";
}
