function metricName(value) {
  return value.replace(/[^a-zA-Z0-9_:]/g, "_");
}

const KNOWN_ROUTE_LABELS = new Set([
  "/",
  "/healthz",
  "/readyz",
  "/internal/metrics",
  "/api/v1/market/overview",
  "/api/v1/auth/demo/session",
  "/api/v1/auth/me",
  "/api/v1/auth/logout",
  "/api/v1/stocks/search",
  "/api/v1/signals",
  "/api/v1/screener/conditions",
  "/api/v1/screener/query",
  "/api/v1/watchlists",
  "/api/v1/entitlements/me",
  "/api/v1/subscriptions/me",
  "/api/v1/subscriptions/checkout",
  "/api/v1/subscriptions/cancel",
  "/api/v1/webhooks/payment",
  "/api/v1/stream",
  "/api/v1/stream/replay",
]);

export function normalizeRouteLabel(path) {
  const value = String(path || "/").split("?")[0].replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  if (KNOWN_ROUTE_LABELS.has(value)) return value;
  if (/^\/api\/v1\/stocks\/[^/]+$/.test(value)) return "/api/v1/stocks/:ticker";
  const stockSubresource = value.match(/^\/api\/v1\/stocks\/[^/]+\/(quote|chart|flows|news|financials|signals)$/);
  if (stockSubresource) return `/api/v1/stocks/:ticker/${stockSubresource[1]}`;
  if (/^\/api\/v1\/watchlists\/[^/]+\/items\/[^/]+$/.test(value)) return "/api/v1/watchlists/:watchlistId/items/:ticker";
  if (value.startsWith("/api/")) return "api:unmatched";
  return value.startsWith("/") ? "static" : "unknown";
}

function normalizeLabels(labels) {
  return Object.fromEntries(Object.entries(labels || {}).map(([key, value]) => [key, key === "path" ? normalizeRouteLabel(value) : value]));
}

function labelText(labels) {
  const entries = Object.entries(labels || {}).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return "";
  return `{${entries.map(([key, value]) => `${metricName(key)}="${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') }"`).join(",")}}`;
}

function suffixedMetric(key, suffix) {
  const brace = key.indexOf("{");
  return brace === -1 ? `${key}_${suffix}` : `${key.slice(0, brace)}_${suffix}${key.slice(brace)}`;
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

export class MetricsRegistry {
  constructor({ now = () => Date.now(), maxSamples = 10_000 } = {}) {
    this.now = now;
    this.maxSamples = maxSamples;
    this.counters = new Map();
    this.observations = new Map();
  }

  increment(name, labels = {}, amount = 1) {
    const key = `${metricName(name)}${labelText(normalizeLabels(labels))}`;
    this.counters.set(key, (this.counters.get(key) || 0) + amount);
  }

  observe(name, value, labels = {}) {
    const key = `${metricName(name)}${labelText(normalizeLabels(labels))}`;
    const numericValue = Number(value);
    const current = this.observations.get(key) || { count: 0, sum: 0, max: Number.NEGATIVE_INFINITY, values: [] };
    current.count += 1;
    current.sum += numericValue;
    current.max = Math.max(current.max, numericValue);
    current.values.push(numericValue);
    if (current.values.length > this.maxSamples) current.values.shift();
    this.observations.set(key, current);
  }

  snapshot() {
    const observations = Object.fromEntries([...this.observations].map(([key, value]) => [key, {
      count: value.count,
      sum: value.sum,
      max: value.max,
      p50: percentile(value.values, 0.50),
      p95: percentile(value.values, 0.95),
      p99: percentile(value.values, 0.99),
    }]));
    return {
      counters: Object.fromEntries(this.counters),
      observations,
      collectedAt: new Date(this.now()).toISOString(),
    };
  }

  toPrometheus() {
    const lines = [];
    for (const [key, value] of this.counters) lines.push(`${key} ${value}`);
    for (const [key, value] of this.observations) {
      lines.push(`${suffixedMetric(key, "count")} ${value.count}`);
      lines.push(`${suffixedMetric(key, "sum")} ${value.sum}`);
      lines.push(`${suffixedMetric(key, "max")} ${value.max}`);
      lines.push(`${suffixedMetric(key, "p50")} ${percentile(value.values, 0.50)}`);
      lines.push(`${suffixedMetric(key, "p95")} ${percentile(value.values, 0.95)}`);
      lines.push(`${suffixedMetric(key, "p99")} ${percentile(value.values, 0.99)}`);
    }
    return `${lines.join("\n")}\n`;
  }
}
