import { DATA_STATUSES, SIGNAL_STATUSES } from "./constants.js";

const TERMINAL_STATUSES = new Set(["EXPIRED", "CANCELLED"]);

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateSignalHealth(signal, {
  now = Date.now(),
  heartbeatTimeoutMs = 30_000,
  evaluationTimeoutMs = 5 * 60_000,
} = {}) {
  const storedStatus = SIGNAL_STATUSES.includes(signal?.status) ? signal.status : "SUSPENDED";
  const heartbeatAt = timestamp(signal?.lastHeartbeatAt);
  const evaluatedAt = timestamp(signal?.lastEvaluatedAt);
  const staleAfter = timestamp(signal?.staleAfter);
  const heartbeatHealthy = heartbeatAt !== null && heartbeatAt <= now && now - heartbeatAt <= heartbeatTimeoutMs;
  const evaluationHealthy = evaluatedAt !== null && evaluatedAt <= now && now - evaluatedAt <= evaluationTimeoutMs;
  const dataStatus = DATA_STATUSES.includes(signal?.dataStatus) ? signal.dataStatus : "UNAVAILABLE";
  const dataFresh = staleAfter !== null && now < staleAfter;

  let effectiveStatus = storedStatus;
  let reason = "HEALTHY";
  if (!TERMINAL_STATUSES.has(storedStatus) && !heartbeatHealthy) {
    effectiveStatus = "SUSPENDED";
    reason = "ENGINE_HEARTBEAT_STALE";
  } else if (!TERMINAL_STATUSES.has(storedStatus) && !evaluationHealthy) {
    effectiveStatus = "SUSPENDED";
    reason = "ENGINE_EVALUATION_STALE";
  }

  return {
    effectiveStatus,
    effectiveDataStatus: staleAfter === null ? "UNAVAILABLE" : dataFresh ? dataStatus : "STALE",
    heartbeatHealthy,
    evaluationHealthy,
    dataFresh,
    reason,
  };
}
