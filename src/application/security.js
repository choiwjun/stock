export class FixedWindowRateLimiter {
  constructor({ windowMs = 60_000, max = 120, maxBuckets = 10_000, now = () => Date.now() } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.maxBuckets = maxBuckets;
    this.now = now;
    this.buckets = new Map();
  }

  consume(key) {
    const currentTime = this.now();
    const current = this.buckets.get(key);
    for (const [bucketKey, bucketValue] of this.buckets) {
      if (bucketValue.resetAt <= currentTime) this.buckets.delete(bucketKey);
    }
    if (!current || current.resetAt <= currentTime) {
      if (this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey !== undefined) this.buckets.delete(oldestKey);
      }
    }
    const bucket = !current || current.resetAt <= currentTime ? { count: 0, resetAt: currentTime + this.windowMs } : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    return { allowed: bucket.count <= this.max, remaining: Math.max(0, this.max - bucket.count), resetAt: bucket.resetAt };
  }
}

export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

export function normalizeOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function normalizeRequestId(candidate, fallback) {
  return typeof candidate === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(candidate) ? candidate : fallback;
}

export function securityHeaders({ production = false } = {}) {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
    "content-security-policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:;",
    ...(production ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
  };
}
