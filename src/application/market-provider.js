import {
  getStock,
  listStocks,
  makeChart,
  makeFinancials,
  makeFlows,
  makeMarketOverview,
  makeNews,
  makeQuote,
  searchStocks,
} from "../domain/fixtures.js";
import { DATA_STATUSES } from "../domain/constants.js";

export const SUPPORTED_SECURITY_TYPE = "COMMON_STOCK";
export const FRESHNESS_DEFAULTS = Object.freeze({ delayedAfterMs: 10_000, staleAfterMs: 60_000 });

export class ProviderUnavailableError extends Error {
  constructor(message = "market provider unavailable", cause = undefined) {
    super(message, { cause });
    this.name = "ProviderUnavailableError";
    this.code = "UPSTREAM_UNAVAILABLE";
  }
}

export class ProviderConfigurationError extends Error {
  constructor(kind) {
    super(`Unsupported market provider: ${kind}`);
    this.name = "ProviderConfigurationError";
    this.code = "PROVIDER_NOT_CONFIGURED";
  }
}

export class InstrumentNotSupportedError extends Error {
  constructor(ticker) {
    super(`Unsupported instrument: ${ticker}`);
    this.name = "InstrumentNotSupportedError";
    this.code = "INSTRUMENT_NOT_SUPPORTED";
  }
}

function parseTime(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyFreshness({ asOf, receivedAt, reportedStatus = "REALTIME", now = Date.now(), policy = FRESHNESS_DEFAULTS }) {
  const asOfTime = parseTime(asOf);
  const receivedTime = parseTime(receivedAt);
  if (reportedStatus === "UNAVAILABLE") return "UNAVAILABLE";
  if (!DATA_STATUSES.includes(reportedStatus) || asOfTime === null || receivedTime === null || asOfTime > now || receivedTime > now || receivedTime < asOfTime) return "UNAVAILABLE";
  if (reportedStatus === "STALE" || now - asOfTime >= policy.staleAfterMs) return "STALE";
  if (reportedStatus === "DELAYED" || now - asOfTime >= policy.delayedAfterMs) return "DELAYED";
  return "REALTIME";
}

export function normalizeQuote(quote, { now = Date.now(), policy = FRESHNESS_DEFAULTS } = {}) {
  if (!quote) throw new ProviderUnavailableError("quote missing from market provider");
  const dataStatus = classifyFreshness({ asOf: quote.asOf, receivedAt: quote.receivedAt, reportedStatus: quote.dataStatus, now, policy });
  const asOfTime = parseTime(quote.asOf);
  return {
    ...quote,
    dataStatus,
    staleAfter: quote.staleAfter || (asOfTime === null ? null : new Date(asOfTime + policy.staleAfterMs).toISOString()),
  };
}

function assertInstrument(stock) {
  if (!stock || stock.securityType !== SUPPORTED_SECURITY_TYPE || !/^\d{6}$/.test(stock.ticker)) return null;
  return stock;
}

function requireInstrument(ticker) {
  const stock = assertInstrument(getStock(ticker));
  if (!stock) throw new InstrumentNotSupportedError(ticker);
  return stock;
}

export class FixtureMarketProvider {
  constructor({ now = () => Date.now(), policy = FRESHNESS_DEFAULTS } = {}) {
    this.now = now;
    this.policy = policy;
    this.kind = "fixture";
    this.source = "demo-fixture (미승인 샌드박스)";
  }

  listStocks() {
    return listStocks().map(assertInstrument).filter(Boolean);
  }

  getStock(ticker) {
    return assertInstrument(getStock(ticker));
  }

  search(query) {
    return searchStocks(query).map(assertInstrument).filter(Boolean);
  }

  getMarketOverview() {
    const overview = makeMarketOverview();
    return { ...overview, movers: overview.movers.map((item) => ({ ...item, quote: normalizeQuote(item.quote, { now: this.now(), policy: this.policy }) })) };
  }

  getQuote(ticker, requestedStatus = "REALTIME") {
    requireInstrument(ticker);
    return normalizeQuote(makeQuote(ticker, requestedStatus), { now: this.now(), policy: this.policy });
  }

  getChart(ticker) {
    requireInstrument(ticker);
    return makeChart(ticker);
  }

  getFlows(ticker) {
    requireInstrument(ticker);
    return { ...makeFlows(ticker), nextCursor: null };
  }

  getNews(ticker) {
    requireInstrument(ticker);
    return { ...makeNews(ticker), nextCursor: null };
  }

  getFinancials(ticker) {
    requireInstrument(ticker);
    return { ...makeFinancials(ticker), nextCursor: null };
  }
}

export function createMarketProvider({ kind = "fixture", ...options } = {}) {
  if (kind === "fixture") return new FixtureMarketProvider(options);
  throw new ProviderConfigurationError(kind);
}
