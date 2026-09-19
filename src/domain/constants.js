export const DATA_STATUSES = Object.freeze([
  "REALTIME",
  "DELAYED",
  "STALE",
  "UNAVAILABLE",
]);

export const SIGNAL_STATUSES = Object.freeze([
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "CANCELLED",
  "VALIDATING",
]);

export const ENTITLEMENT = "REALTIME_SIGNAL";

export function isMemberRole(role) {
  return role === "member" || role === "subscriber";
}

export function hasSignalEntitlement(role) {
  return role === "subscriber";
}

export function requireRole(role, minimum) {
  if (minimum === "member") return isMemberRole(role);
  if (minimum === "subscriber") return hasSignalEntitlement(role);
  return true;
}

export const STATUS_LABELS = Object.freeze({
  REALTIME: "실시간",
  DELAYED: "지연",
  STALE: "오래된 데이터",
  UNAVAILABLE: "사용 불가",
  ACTIVE: "활성",
  SUSPENDED: "일시중지",
  EXPIRED: "만료",
  CANCELLED: "취소됨",
  VALIDATING: "검증 중",
});

export const ROLE_LABELS = Object.freeze({
  guest: "방문자",
  member: "무료 회원",
  subscriber: "구독자",
});
