import { DATA_STATUSES } from "./constants.js";
import { evaluateSignalHealth } from "./watchdog.js";

export const DEMO_USER_ID = "demo-user";
export const DEMO_WATCHLIST_ID = "watchlist-demo-user";
export const PRIMARY_TICKER = "005930";

const STOCKS = [
  { ticker: "005930", name: "삼성전자", exchange: "KOSPI", marketType: "KOSPI", securityType: "COMMON_STOCK", tradingStatus: "거래 중", sector: "전기전자" },
  { ticker: "000660", name: "SK하이닉스", exchange: "KOSPI", marketType: "KOSPI", securityType: "COMMON_STOCK", tradingStatus: "거래 중", sector: "전기전자" },
  { ticker: "035420", name: "NAVER", exchange: "KOSPI", marketType: "KOSPI", securityType: "COMMON_STOCK", tradingStatus: "거래 중", sector: "서비스업" },
  { ticker: "035720", name: "카카오", exchange: "KOSPI", marketType: "KOSPI", securityType: "COMMON_STOCK", tradingStatus: "거래 중", sector: "서비스업" },
  { ticker: "068270", name: "셀트리온", exchange: "KOSPI", marketType: "KOSPI", securityType: "COMMON_STOCK", tradingStatus: "거래 중", sector: "의약품" },
  { ticker: "247540", name: "에코프로비엠", exchange: "KOSDAQ", marketType: "KOSDAQ", securityType: "COMMON_STOCK", tradingStatus: "거래 중", sector: "IT부품" },
];

const PRICE_MAP = {
  "005930": { price: 71200, change: 1800, volume: 12830412 },
  "000660": { price: 184500, change: -2400, volume: 2930121 },
  "035420": { price: 214000, change: 3500, volume: 806211 },
  "035720": { price: 48600, change: -700, volume: 1920440 },
  "068270": { price: 177300, change: 2100, volume: 701302 },
  "247540": { price: 154200, change: 4800, volume: 1398821 },
};

const SIGNAL_MAP = {
  "005930": { direction: "BUY", strength: "MEDIUM", status: "ACTIVE", evidence: [{ type: "VOLUME_SURGE", label: "거래량 증가", value: "최근 20일 평균 대비 2.1배" }, { type: "FLOW_TREND", label: "외국인 수급 개선", value: "최근 3거래일 순매수" }] },
  "000660": { direction: "SELL", strength: "LOW", status: "VALIDATING", evidence: [{ type: "VOLATILITY", label: "단기 변동성 확대", value: "최근 5일 변동성 주의" }] },
  "035420": { direction: "NEUTRAL", strength: "LOW", status: "ACTIVE", evidence: [{ type: "FLOW_TREND", label: "수급 중립", value: "주체별 방향 혼조" }] },
  "035720": { direction: "BUY", strength: "LOW", status: "SUSPENDED", evidence: [{ type: "DATA_FRESHNESS", label: "입력 데이터 확인 중", value: "신선도 재검증 필요" }] },
  "068270": { direction: "NEUTRAL", strength: "MEDIUM", status: "EXPIRED", evidence: [{ type: "VALIDITY", label: "유효기간 종료", value: "새 평가 대기" }] },
  "247540": { direction: "BUY", strength: "HIGH", status: "ACTIVE", evidence: [{ type: "PRICE_MOMENTUM", label: "가격 흐름 개선", value: "단기 추세 확인" }, { type: "VOLUME_SURGE", label: "거래량 증가", value: "평균 대비 1.8배" }] },
};

function isoAgo(milliseconds) {
  return new Date(Date.now() - milliseconds).toISOString();
}

function isoFromNow(milliseconds) {
  return new Date(Date.now() + milliseconds).toISOString();
}

export function listStocks() {
  return STOCKS.map((stock) => ({ ...stock }));
}

export function getStock(ticker) {
  const stock = STOCKS.find((item) => item.ticker === ticker);
  return stock ? { ...stock } : null;
}

export function searchStocks(query = "") {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return STOCKS.filter((stock) => [stock.ticker, stock.name, stock.exchange].some((field) => field.toLowerCase().includes(normalized))).map((stock) => ({ ...stock }));
}

export function makeQuote(ticker, status = "REALTIME") {
  const stock = getStock(ticker);
  const base = PRICE_MAP[ticker] ?? PRICE_MAP[PRIMARY_TICKER];
  const safeStatus = DATA_STATUSES.includes(status) ? status : "REALTIME";
  const age = safeStatus === "STALE" ? 120_000 : safeStatus === "DELAYED" ? 18_000 : 800;
  const asOf = isoAgo(age);
  return {
    ticker,
    name: stock?.name ?? "알 수 없는 종목",
    price: base.price,
    change: base.change,
    changeRate: Number(((base.change / (base.price - base.change)) * 100).toFixed(2)),
    volume: base.volume,
    asOf,
    receivedAt: isoAgo(Math.max(age - 500, 200)),
    dataStatus: safeStatus,
    staleAfter: isoFromNow(safeStatus === "STALE" ? -60_000 : 10_000),
    source: "demo-fixture (미승인 샌드박스)",
  };
}

export function makeChart(ticker) {
  const base = PRICE_MAP[ticker]?.price ?? PRICE_MAP[PRIMARY_TICKER].price;
  const points = Array.from({ length: 18 }, (_, index) => {
    const wave = Math.sin(index / 2.8) * base * 0.012;
    const trend = index * base * 0.0022;
    return { at: isoAgo((17 - index) * 3_600_000), price: Math.round(base * 0.965 + wave + trend) };
  });
  return { ticker, interval: "1h", period: "1D", items: points, asOf: isoAgo(800), dataStatus: "REALTIME", source: "demo-fixture (미승인 샌드박스)" };
}

export function makeFlows(ticker) {
  const base = PRICE_MAP[ticker]?.volume ?? 1_000_000;
  return {
    ticker,
    asOf: isoAgo(4_000),
    dataStatus: "REALTIME",
    source: "demo-fixture (미승인 샌드박스)",
    items: [
      { participant: "외국인", net: Math.round(base * 0.18), direction: "순매수" },
      { participant: "기관", net: Math.round(-base * 0.07), direction: "순매도" },
      { participant: "개인", net: Math.round(-base * 0.11), direction: "순매도" },
    ],
  };
}

export function makeNews(ticker) {
  const stock = getStock(ticker);
  return {
    ticker,
    asOf: isoAgo(30_000),
    dataStatus: "DELAYED",
    source: "demo-fixture (미승인 샌드박스)",
    items: [
      { id: `${ticker}-news-1`, title: `${stock?.name ?? "종목"} 관련 시장 데이터 업데이트`, publishedAt: isoAgo(1_800_000), source: "샌드박스 리서치" },
      { id: `${ticker}-news-2`, title: "업종 수급과 거래량 흐름을 함께 확인하세요", publishedAt: isoAgo(7_200_000), source: "샌드박스 리서치" },
    ],
  };
}

export function makeFinancials(ticker) {
  return {
    ticker,
    asOf: isoAgo(86_400_000),
    dataStatus: "DELAYED",
    source: "demo-fixture (미승인 샌드박스)",
    items: [
      { metric: "매출액", period: "최근 연간", value: "290.4조원", change: "+2.1%" },
      { metric: "영업이익", period: "최근 연간", value: "32.7조원", change: "+18.4%" },
      { metric: "ROE", period: "최근 연간", value: "9.8%", change: "+0.7%p" },
    ],
  };
}

function signalBase(ticker) {
  const raw = SIGNAL_MAP[ticker] ?? SIGNAL_MAP[PRIMARY_TICKER];
  return { ...raw, evidence: raw.evidence.map((item) => ({ ...item })) };
}

export function makeSignal(ticker, cursor = { streamKey: `signal:${ticker}:default`, epoch: 1, sequence: 100 }) {
  const raw = signalBase(ticker);
  const occurredAt = isoAgo(5 * 60_000);
  const lastHeartbeatAt = isoAgo(1_000);
  const lastEvaluatedAt = isoAgo(30_000);
  const staleAfter = isoFromNow(30_000);
  const health = evaluateSignalHealth({ status: raw.status, dataStatus: raw.status === "SUSPENDED" ? "STALE" : "REALTIME", lastHeartbeatAt, lastEvaluatedAt, staleAfter });
  return {
    eventId: `sig_evt_${ticker}_${cursor.sequence}`,
    streamKey: cursor.streamKey,
    epoch: cursor.epoch,
    sequence: cursor.sequence,
    ticker,
    strategyKey: "default",
    direction: raw.direction,
    status: raw.status,
    effectiveStatus: health.effectiveStatus,
    dataStatus: health.effectiveDataStatus,
    strength: raw.strength,
    occurredAt,
    publishedAt: isoAgo(4 * 60_000),
    asOf: occurredAt,
    validUntil: isoFromNow(55 * 60_000),
    lastHeartbeatAt,
    lastEvaluatedAt,
    staleAfter,
    healthReason: health.reason,
    algorithmVersion: "demo-alpha-2026.09",
    evidence: raw.evidence,
    riskDisclosureId: "signal-disclosure-v1",
  };
}

export function makeSignalPreview(ticker) {
  const stock = getStock(ticker);
  return {
    ticker,
    name: stock?.name ?? "종목",
    locked: true,
    previewLabel: "실시간 신호 제공 종목",
    dataStatus: "REALTIME",
    asOf: isoAgo(4_000),
    source: "demo-fixture (미승인 샌드박스)",
    protectedFields: ["direction", "strength", "occurredAt", "publishedAt", "algorithmVersion", "evidence"],
  };
}

export function makeMarketOverview() {
  return {
    session: "장중",
    sessionCode: "OPEN",
    asOf: isoAgo(1_000),
    receivedAt: isoAgo(500),
    dataStatus: "REALTIME",
    source: "demo-fixture (미승인 샌드박스)",
    indices: [
      { name: "코스피", value: 2754.82, change: 18.42, changeRate: 0.67, status: "상승" },
      { name: "코스닥", value: 812.44, change: -2.11, changeRate: -0.26, status: "하락" },
      { name: "원/달러", value: 1384.2, change: 1.9, changeRate: 0.14, status: "상승" },
    ],
    summary: [
      { label: "상승 종목", value: "542" },
      { label: "하락 종목", value: "331" },
      { label: "거래대금", value: "8.4조원" },
      { label: "외국인 수급", value: "+1,240억원" },
    ],
    movers: listStocks().slice(0, 5).map((stock) => ({ ...stock, quote: makeQuote(stock.ticker) })),
  };
}

export function makeConditions() {
  return [
    { id: "market", label: "시장", options: [{ value: "ALL", label: "전체" }, { value: "KOSPI", label: "KOSPI" }, { value: "KOSDAQ", label: "KOSDAQ" }] },
    { id: "priceChange", label: "등락", options: [{ value: "ANY", label: "전체" }, { value: "UP", label: "상승" }, { value: "DOWN", label: "하락" }] },
    { id: "volume", label: "거래량", options: [{ value: "ANY", label: "전체" }, { value: "HIGH", label: "평균 대비 증가" }] },
  ];
}
