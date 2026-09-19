import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

export async function measureHttp({ baseUrl, path, requests = 50, concurrency = 10, fetchImpl = fetch } = {}) {
  if (typeof baseUrl !== "string" || !baseUrl) throw new TypeError("BASE_URL_REQUIRED");
  if (typeof path !== "string" || !path.startsWith("/")) throw new TypeError("PATH_REQUIRED");
  if (!Number.isInteger(requests) || requests < 1 || requests > 5_000) throw new RangeError("REQUESTS_OUT_OF_RANGE");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > requests) throw new RangeError("CONCURRENCY_OUT_OF_RANGE");

  const latencies = [];
  const statuses = {};
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= requests) return;
      const startedAt = performance.now();
      let status = "ERROR";
      try {
        const response = await fetchImpl(new URL(path, baseUrl));
        status = String(response.status);
        if (typeof response.arrayBuffer === "function") await response.arrayBuffer();
      } catch {
        // A failed request is still a measured outcome and is not removed from the sample.
      }
      latencies.push(performance.now() - startedAt);
      statuses[status] = (statuses[status] || 0) + 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    baseUrl,
    path,
    requests,
    concurrency,
    statuses,
    latencyMs: {
      p50: Number(percentile(latencies, 0.50).toFixed(3)),
      p95: Number(percentile(latencies, 0.95).toFixed(3)),
      p99: Number(percentile(latencies, 0.99).toFixed(3)),
      max: Number(Math.max(...latencies).toFixed(3)),
    },
  };
}

async function main() {
  const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";
  const path = process.env.MEASURE_PATH || "/api/v1/market/overview";
  const requests = Number(process.env.MEASURE_REQUESTS || 50);
  const concurrency = Number(process.env.MEASURE_CONCURRENCY || 10);
  console.log(JSON.stringify(await measureHttp({ baseUrl, path, requests, concurrency }), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
