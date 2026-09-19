import { hasCursorGap, shouldIgnoreCursor } from "/cursor.js";

const USER_ID = "demo-user";
const ROLE_LABELS = { guest: "방문자", member: "무료 회원", subscriber: "구독자" };
const STATUS_LABELS = { REALTIME: "실시간", DELAYED: "지연", STALE: "오래된 데이터", UNAVAILABLE: "사용 불가", ACTIVE: "활성", SUSPENDED: "일시중지", EXPIRED: "만료", CANCELLED: "취소됨", VALIDATING: "검증 중" };
const SIGNAL_DIRECTION_LABELS = { BUY: "매수", SELL: "매도", NEUTRAL: "중립" };
const NON_ACTIONABLE_SIGNAL_STATUSES = new Set(["SUSPENDED", "EXPIRED", "CANCELLED", "VALIDATING"]);

const state = {
  role: localStorage.getItem("demo-role") || "guest",
  searchResults: [],
  searchQuery: "",
  searchActiveIndex: -1,
  searchError: null,
  authError: null,
  sessionError: null,
  sessionNotice: "",
  watchlistPending: null,
  watchlistError: null,
  stream: { source: null, ticker: null, lastCursor: null, lastReceivedAt: null, status: "idle", demoGap: false },
  liveSignal: null,
  screener: null,
  screenerError: null,
  subscriptionError: null,
  returnRoute: "",
  session: { authenticated: false, csrfToken: null, userId: null, role: null },
};

class ApiError extends Error {
  constructor(body, status) {
    super(body?.error?.message || "요청을 처리하지 못했습니다.");
    this.code = body?.error?.code || "INTERNAL_ERROR";
    this.requestId = body?.requestId || "-";
    this.status = status;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function idempotencyKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("x-demo-role", state.role);
  headers.set("x-demo-user-id", USER_ID);
  if (state.session.csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(String(options.method || "GET").toUpperCase())) headers.set("x-csrf-token", state.session.csrfToken);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.session.authenticated) resetClientSession("세션이 만료되었습니다. 현재 작업을 유지한 채 다시 로그인해 주세요.");
    throw new ApiError(body, response.status);
  }
  return body;
}

function announce(message) {
  const region = document.querySelector("#live-region");
  if (region) region.textContent = message;
}

function confirmAction({ title, message, confirmLabel = "확인", danger = false }) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const dialog = document.createElement("div");
    dialog.className = "confirm-backdrop";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "confirm-title");
    dialog.setAttribute("aria-describedby", "confirm-description");
    dialog.innerHTML = `<section class="confirm-sheet" role="document"><h2 id="confirm-title">${escapeHtml(title)}</h2><p id="confirm-description">${escapeHtml(message)}</p><div class="confirm-actions"><button class="btn btn-secondary" type="button" data-confirm-cancel>취소</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm-submit>${escapeHtml(confirmLabel)}</button></div></section>`;
    document.body.append(dialog);
    const cancel = dialog.querySelector("[data-confirm-cancel]");
    const submit = dialog.querySelector("[data-confirm-submit]");
    const focusable = [cancel, submit];
    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      dialog.remove();
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) previouslyFocused.focus();
      resolve(result);
    };
    cancel.addEventListener("click", () => close(false));
    submit.addEventListener("click", () => close(true));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(false); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") return close(false);
      if (event.key !== "Tab") return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    submit.focus();
  });
}

function safeReturnRoute(value) {
  const raw = String(value || "");
  const candidate = raw.startsWith("#") ? raw.slice(1) : raw;
  const path = candidate.split("?", 1)[0];
  const allowed = new Set(["/market", "/signals", "/screener", "/watchlist", "/subscription", "/account"]);
  if (allowed.has(path) || /^\/stocks\/[A-Za-z0-9]+$/.test(path)) return `#${path}`;
  return "#/market";
}

function resetClientSession(message = "") {
  state.returnRoute = safeReturnRoute(location.hash);
  state.session = { authenticated: false, csrfToken: null, userId: null, role: null };
  state.role = "guest";
  state.authError = null;
  state.sessionError = null;
  state.sessionNotice = message;
  localStorage.setItem("demo-role", state.role);
  if (message) announce(message);
  renderSessionNotice();
}

function renderSessionNotice() {
  const root = document.querySelector("#session-notice-root");
  if (!root) return;
  const authErrorBlock = state.authError ? `<div class="session-notice error" role="alert"><span><strong>로그인할 수 없습니다.</strong> ${escapeHtml(state.authError.message)} <span class="error-id">(${escapeHtml(state.authError.code)}) · 오류 ID ${escapeHtml(state.authError.requestId || "-")}</span></span><span class="page-actions"><button class="btn btn-secondary btn-quiet" type="button" data-action="retry-login">다시 로그인</button><button class="btn btn-quiet" type="button" data-action="dismiss-auth-error">닫기</button></span></div>` : "";
  const sessionErrorBlock = state.sessionError ? `<div class="session-notice error" role="alert"><span><strong>로그아웃할 수 없습니다.</strong> ${escapeHtml(state.sessionError.message)} <span class="error-id">(${escapeHtml(state.sessionError.code)}) · 오류 ID ${escapeHtml(state.sessionError.requestId || "-")}</span></span><span class="page-actions"><button class="btn btn-secondary btn-quiet" type="button" data-action="retry-logout">다시 로그아웃</button><button class="btn btn-quiet" type="button" data-action="dismiss-session-error">닫기</button></span></div>` : "";
  const sessionNoticeBlock = state.sessionNotice ? `<div class="session-notice" role="alert"><span>${escapeHtml(state.sessionNotice)}</span><span class="page-actions"><button class="btn btn-primary btn-quiet" type="button" data-action="sandbox-login">다시 로그인</button><button class="btn btn-quiet" type="button" data-action="dismiss-session-notice">닫기</button></span></div>` : "";
  root.innerHTML = `${authErrorBlock}${sessionErrorBlock}${sessionNoticeBlock}`;
}

function freshness(status, asOf, source = "") {
  const normalized = String(status || "UNAVAILABLE").toLowerCase();
  return `<span class="freshness ${normalized}"><span aria-hidden="true">●</span>${escapeHtml(STATUS_LABELS[status] || status || "상태 확인 필요")}<span class="sr-only">, 기준 시각 ${escapeHtml(formatDateTime(asOf))}</span></span>${source ? `<span class="muted small">${escapeHtml(source)}</span>` : ""}`;
}

function quotePresentation(quote) {
  const dataStatus = quote?.dataStatus || "UNAVAILABLE";
  if (dataStatus === "UNAVAILABLE") return {
    priceLabel: "마지막 확인 가격",
    changeLabel: "마지막 확인 등락",
    rateLabel: "마지막 확인 등락률",
    noticeClass: "error",
    notice: "현재 시세를 확인할 수 없어 마지막 확인값을 표시합니다. 최신값으로 해석하지 마세요.",
  };
  if (dataStatus === "STALE") return {
    priceLabel: "마지막 확인 가격",
    changeLabel: "마지막 확인 등락",
    rateLabel: "마지막 확인 등락률",
    noticeClass: "warning",
    notice: "시세가 오래되어 마지막 확인값을 표시합니다. 최신값으로 해석하지 마세요.",
  };
  if (dataStatus === "DELAYED") return {
    priceLabel: "지연 시세",
    changeLabel: "지연 등락",
    rateLabel: "지연 등락률",
    noticeClass: "warning",
    notice: "지연된 시세입니다. 기준 시각과 수신 시각을 확인하세요.",
  };
  return { priceLabel: "현재가", changeLabel: "등락", rateLabel: "등락률", noticeClass: "", notice: "" };
}

function quotePriceCell(quote) {
  const view = quotePresentation(quote);
  return `<span class="quote-cell"><span class="quote-cell-label">${escapeHtml(view.priceLabel)}</span><span class="numeric">${formatNumber(quote.price)}원</span></span>`;
}

function quoteRateCell(quote) {
  const view = quotePresentation(quote);
  return `<span class="quote-cell"><span class="quote-cell-label">${escapeHtml(view.rateLabel)}</span><span class="numeric ${changeClass(quote.change)}">${quote.changeRate > 0 ? "+" : ""}${quote.changeRate}%</span></span>`;
}

function freshnessStrip(data, connection = "연결됨") {
  return `<div class="status-strip freshness-rail" role="status">
    <div class="status-strip-left"><span class="status-dot"></span><span class="status-label">${escapeHtml(connection)}</span><span>기준 시각 ${escapeHtml(formatDateTime(data.asOf))}</span></div>
    <div class="status-strip-right">${freshness(data.dataStatus, data.asOf)}<span>수신 ${escapeHtml(formatDateTime(data.receivedAt || data.asOf))}</span></div>
  </div>`;
}

function signalStatusBadge(status) {
  const type = status === "SUSPENDED" || status === "EXPIRED" || status === "VALIDATING" ? "badge-warning" : status === "CANCELLED" ? "badge-error" : "badge-primary";
  return `<span class="badge ${type}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function changeClass(value) { return value > 0 ? "up" : value < 0 ? "down" : "neutral"; }
function changeLabel(value) { return value > 0 ? "상승" : value < 0 ? "하락" : "보합"; }

function searchResultId(ticker) { return `search-result-${ticker}`; }

function searchInputAttributes(route) {
  const visible = route.name === "market" && state.searchResults.length > 0;
  const activeTicker = state.searchResults[state.searchActiveIndex]?.ticker;
  return `data-search-input role="combobox" aria-autocomplete="list" aria-controls="search-results" aria-expanded="${visible}" aria-activedescendant="${activeTicker ? searchResultId(activeTicker) : ""}"${state.searchError ? " aria-describedby=\"search-error\"" : ""}`;
}

function routeFromHash() {
  const raw = location.hash.replace(/^#/, "") || "/market";
  const [path] = raw.split("?");
  const match = path.match(/^\/stocks\/([A-Za-z0-9]+)$/);
  if (match) return { name: "stock", ticker: match[1] };
  if (path === "/signals") return { name: "signals" };
  if (path === "/screener") return { name: "screener" };
  if (path === "/watchlist") return { name: "watchlist" };
  if (path === "/subscription" || path === "/account") return { name: "subscription" };
  return { name: "market" };
}

function navigate(route) {
  location.hash = route.startsWith("#") ? route : `#${route}`;
}

function renderShell(route) {
  const navItems = [
    ["/market", "⌂", "시장", "market"],
    ["/signals", "◈", "실시간 시그널", "signals"],
    ["/screener", "⌕", "조건 스크리너", "screener"],
    ["/watchlist", "☆", "관심종목", "watchlist"],
  ];
  document.querySelector("#app").innerHTML = `<header class="topbar">
    <a class="brand" href="#/market" data-route="/market" aria-label="시그널랩 홈">
      <span class="brand-mark" aria-hidden="true">SL</span><span class="brand-copy">시그널랩<small>국내 주식 리서치</small></span>
    </a>
    <div class="workspace-command" data-command="market-status" aria-label="리서치 데스크 상태">
      <span class="command-kicker">EVIDENCE DESK</span>
      <strong>장중 마켓</strong>
      <span class="command-status"><span class="status-dot" aria-hidden="true"></span>근거 우선 탐색</span>
    </div>
    <nav class="topnav" aria-label="주요 작업">
      ${navItems.slice(0, 4).map(([href, icon, label, name]) => `<a class="topnav-link" href="#${href}" data-route="${href}" aria-current="${route.name === name ? "page" : "false"}">${escapeHtml(label)}</a>`).join("")}
    </nav>
    <form class="global-search" data-search-form role="search">
      <label class="sr-only" for="global-search-input">종목명 또는 코드 검색</label>
      <input id="global-search-input" name="q" value="${escapeHtml(state.searchQuery)}" placeholder="종목명·종목코드 검색" autocomplete="off" ${searchInputAttributes(route)} />
      <button type="submit" aria-label="검색">검색</button>
    </form>
    <div class="topbar-actions">
      <div class="role-switcher" aria-label="프로토타입 권한 모드">
        ${state.session.authenticated ? `<span class="badge badge-primary">세션 로그인 · ${escapeHtml(ROLE_LABELS[state.role] || state.role)}</span>` : ["guest", "member", "subscriber"].map((role) => `<button type="button" data-role="${role}" aria-pressed="${state.role === role}">${ROLE_LABELS[role]}</button>`).join("")}
      </div>
      ${state.session.authenticated ? `<button class="btn btn-quiet" type="button" data-action="logout">로그아웃</button>` : `<button class="btn btn-quiet" type="button" data-action="sandbox-login">sandbox 로그인</button>`}
      <a class="btn btn-quiet" href="#/subscription" data-route="/subscription">구독·계정</a>
    </div>
  </header>
  <div class="market-tape" aria-label="시장 테이프" role="region">
    <div class="market-tape-inner">
      <span class="tape-item tape-lead"><span class="tape-kicker">MARKET TAPE</span><strong>국내 개별주식</strong></span>
      <span class="tape-item"><span>장 상태</span><strong data-tape="session">데모 관찰</strong></span>
      <span class="tape-item"><span>KOSPI · KOSDAQ</span><strong data-tape="index">본문 기준 시각</strong></span>
      <span class="tape-item"><span>데이터 출처</span><strong data-tape="source">demo-fixture</strong></span>
      <span class="tape-item"><span>기준 시각</span><strong data-tape="asOf">본문 확인</strong></span>
      <span class="tape-item tape-note"><span>주문·계좌 기능 없음</span></span>
    </div>
  </div>
  <div id="session-notice-root"></div>
  <div class="layout">
    <aside class="sidebar" aria-label="주요 메뉴">
      <div class="sidebar-brand" aria-hidden="true"><span class="sidebar-brand-mark">SL</span><span><strong>시그널랩</strong><small>EVIDENCE DESK</small></span></div>
      <div><p class="nav-group-label">WORKSPACE</p><nav><ul class="nav-list">${navItems.map(([href, icon, label, name]) => `<li><a class="nav-link" href="#${href}" data-route="${href}" aria-current="${route.name === name ? "page" : "false"}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></a></li>`).join("")}</ul></nav></div>
      <div class="sidebar-note"><strong>데모 환경</strong>실제 공급자·결제·프리미엄 신호가 아닌 계약 검증용 fixture입니다.</div>
    </aside>
    <main id="main-content" class="main"><div class="main-inner"><div class="skeleton" aria-label="페이지를 불러오는 중"></div></div></main>
  </div>`;
  renderSessionNotice();
}

function pageHeading(eyebrow, title, description = "", actions = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${description ? `<p class="lede">${escapeHtml(description)}</p>` : ""}</div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
}

function card(title, body, className = "", id = "") {
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
  return `<section${idAttribute} class="card ${className}"><div class="section-heading"><h2>${escapeHtml(title)}</h2></div>${body}</section>`;
}

function apiErrorMarkup(errorValue, retryRoute = "") {
  return `<div class="error-state"><span class="badge badge-error">오류</span><h3>데이터를 불러오지 못했습니다</h3><p>${escapeHtml(errorValue.message || "잠시 후 다시 시도해 주세요.")}</p><span class="error-id">오류 ID ${escapeHtml(errorValue.requestId || "-")}</span>${retryRoute ? `<button class="btn btn-secondary" data-route="${retryRoute}" type="button">다시 시도</button>` : ""}</div>`;
}

function retryableErrorMarkup(errorValue, action, id = "") {
  return `<div${id ? ` id="${escapeHtml(id)}"` : ""} class="error-state" role="alert"><span class="badge badge-error">오류</span><h3>요청을 완료하지 못했습니다</h3><p>${escapeHtml(errorValue.message || "잠시 후 다시 시도해 주세요.")}</p><span class="error-id">오류 ID ${escapeHtml(errorValue.requestId || "-")}</span><button class="btn btn-secondary" type="button" data-action="${escapeHtml(action)}">다시 시도</button></div>`;
}

function stockLink(stock) {
  const accessibleName = `${stock.name} ${stock.ticker}`;
  return `<a class="table-link" aria-label="${escapeHtml(accessibleName)}" href="#/stocks/${encodeURIComponent(stock.ticker)}" data-route="/stocks/${encodeURIComponent(stock.ticker)}">${escapeHtml(stock.name)}<span class="stock-code">${escapeHtml(stock.ticker)}</span></a>`;
}

function watchlistErrorMarkup(ticker = null) {
  const error = state.watchlistError;
  if (!error || (ticker && error.ticker !== ticker)) return "";
  return `<div id="watchlist-error-${escapeHtml(error.ticker)}" class="inline-error" role="alert"><strong>관심종목 작업을 완료하지 못했습니다.</strong><span>${escapeHtml(error.message)} (${escapeHtml(error.code)}) · 오류 ID ${escapeHtml(error.requestId)}</span></div>`;
}

function stockWatchlistAction(ticker, isSaved) {
  const pending = state.watchlistPending?.ticker === ticker ? state.watchlistPending.action : null;
  const describedBy = state.watchlistError?.ticker === ticker ? ` aria-describedby="watchlist-error-${escapeHtml(ticker)}"` : "";
  const button = pending
    ? `<button class="btn btn-secondary" type="button" disabled aria-busy="true">${pending === "add" ? "저장 중…" : "삭제 중…"}</button>`
    : `<button class="btn ${isSaved ? "btn-secondary" : "btn-primary"}" type="button" data-action="${isSaved ? "remove-watchlist" : "add-watchlist"}" data-ticker="${escapeHtml(ticker)}"${describedBy}>${isSaved ? "★ 관심종목 삭제" : "☆ 관심종목 추가"}</button>`;
  return `<div class="action-stack">${button}${watchlistErrorMarkup(ticker)}</div>`;
}

function watchlistRemoveButton(ticker) {
  const pending = state.watchlistPending?.ticker === ticker;
  const describedBy = state.watchlistError?.ticker === ticker ? ` aria-describedby="watchlist-error-${escapeHtml(ticker)}"` : "";
  return `<button class="btn btn-danger btn-quiet" type="button" data-action="remove-watchlist" data-ticker="${escapeHtml(ticker)}"${describedBy}${pending ? " disabled aria-busy=\"true\"" : ""}>${pending ? "삭제 중…" : "삭제"}</button>`;
}

async function renderMarket() {
  const main = document.querySelector("#main-content .main-inner");
  const route = routeFromHash();
  try {
    const overview = await api("/api/v1/market/overview");
    const tapeSource = document.querySelector('[data-tape="source"]');
    if (tapeSource) tapeSource.textContent = overview.source;
    const tapeStatus = document.querySelector('[data-tape="session"]');
    if (tapeStatus) tapeStatus.textContent = overview.session || overview.indices?.[0]?.status || "기준 확인";
    const tapeAsOf = document.querySelector('[data-tape="asOf"]');
    if (tapeAsOf) tapeAsOf.textContent = `기준 ${formatDateTime(overview.asOf)}`;
    const tapeIndex = document.querySelector('[data-tape="index"]');
    if (tapeIndex) {
      const indices = (overview.indices || []).slice(0, 2).map((index) => `${index.name} ${index.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} (${index.changeRate > 0 ? "+" : ""}${index.changeRate.toFixed(2)}%)`);
      tapeIndex.textContent = indices.length ? indices.join(" · ") : "지수 확인 불가";
    }

    const metric = (label) => overview.summary.find((item) => item.label === label)?.value || "—";
    const metricNumber = (label) => Number(String(metric(label)).replace(/[^0-9.-]/g, "")) || 0;
    const advances = metricNumber("상승 종목");
    const declines = metricNumber("하락 종목");
    const total = Math.max(advances + declines, 1);
    const advanceWidth = Math.round((advances / total) * 100);
    const declineWidth = Math.max(0, 100 - advanceWidth);
    const leadIndex = overview.indices?.[0];
    const leadBias = leadIndex?.change >= 0 ? "상승 쪽" : "하락 쪽";
    const searchBlock = state.searchError
      ? retryableErrorMarkup(state.searchError, "retry-search", "search-error")
      : state.searchResults.length
        ? `<div class="search-results" id="search-results" role="listbox" aria-label="검색 결과">${state.searchResults.map((stock, index) => `<a class="search-result" id="${searchResultId(stock.ticker)}" role="option" aria-selected="${index === state.searchActiveIndex}" href="#/stocks/${stock.ticker}" data-route="/stocks/${stock.ticker}" data-search-result-index="${index}"><span><span class="stock-name">${escapeHtml(stock.name)}</span><span class="stock-code">${escapeHtml(stock.ticker)}</span></span><span class="stock-sector">${escapeHtml(stock.exchange)} · ${escapeHtml(stock.securityType)} · ${escapeHtml(stock.tradingStatus)}</span></a>`).join("")}</div>`
        : state.searchQuery ? `<div class="empty-state"><h3>검색 결과가 없습니다</h3><p>종목명 또는 6자리 종목코드를 확인해 주세요.</p></div>` : "";
    const indexRows = (overview.indices || []).slice(0, 2).map((index) => `<div class="pulse-index-row"><div><span class="pulse-index-name">${escapeHtml(index.name)}</span><span class="pulse-index-status ${changeClass(index.change)}">${changeLabel(index.change)}</span></div><strong class="numeric">${escapeHtml(index.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }))}</strong><span class="numeric ${changeClass(index.change)}">${index.change > 0 ? "+" : ""}${escapeHtml(index.change.toFixed(2))} · ${index.changeRate > 0 ? "+" : ""}${escapeHtml(index.changeRate.toFixed(2))}%</span></div>`).join("");
    const moverRows = overview.movers.map((item, index) => `<tr><td class="rank-cell">${String(index + 1).padStart(2, "0")}</td><td>${stockLink(item)}<span class="mover-sector">${escapeHtml(item.exchange)} · ${escapeHtml(item.sector)}</span></td><td class="numeric">${quotePriceCell(item.quote)}</td><td class="numeric">${quoteRateCell(item.quote)}</td><td>${freshness(item.quote.dataStatus, item.quote.asOf, item.quote.source)}</td></tr>`).join("");
    main.innerHTML = `<section class="market-hero" aria-labelledby="market-title"><div><p class="eyebrow">KOREA / EQUITIES</p><h1 id="market-title">오늘 시장은 어디로 기울었나</h1><p class="lede">장중 숫자를 먼저 읽고, 움직임이 생긴 종목의 근거로 내려갑니다.</p></div><div class="market-hero-meta"><span class="hero-session">${escapeHtml(overview.session)}</span><span>기준 ${escapeHtml(formatDateTime(overview.asOf))}</span><span>${escapeHtml(overview.source)}</span></div></section>${freshnessStrip(overview)}
      <section class="market-pulse" aria-labelledby="pulse-title"><div class="pulse-lead"><div class="section-kicker"><span>MARKET PULSE</span><span>시장 판독</span></div><h2 id="pulse-title">국내 시장의 무게중심은 <strong>${leadBias}</strong>입니다.</h2><p>지수 방향과 시장 폭을 함께 보면 지금 숫자가 몇 종목에 의한 움직임인지 빠르게 확인할 수 있습니다.</p><div class="pulse-index-list" aria-label="주요 시장 지수">${indexRows}</div></div><div class="pulse-readout"><p class="readout-label">시장 폭</p><div class="breadth-summary"><strong>${escapeHtml(metric("상승 종목"))}</strong><span>상승</span><strong>${escapeHtml(metric("하락 종목"))}</strong><span>하락</span></div><div class="breadth-meter" role="img" aria-label="상승 ${escapeHtml(metric("상승 종목"))}, 하락 ${escapeHtml(metric("하락 종목"))}"><span class="breadth-up" style="width:${advanceWidth}%"></span><span class="breadth-down" style="width:${declineWidth}%"></span></div><div class="breadth-legend"><span><i class="legend-dot up" aria-hidden="true"></i>상승 ${escapeHtml(metric("상승 종목"))}</span><span><i class="legend-dot down" aria-hidden="true"></i>하락 ${escapeHtml(metric("하락 종목"))}</span></div><dl class="pulse-facts"><div><dt>거래대금</dt><dd>${escapeHtml(metric("거래대금"))}</dd></div><div><dt>외국인 수급</dt><dd class="${metricNumber("외국인 수급") >= 0 ? "up" : "down"}">${escapeHtml(metric("외국인 수급"))}</dd></div></dl></div></section>
      <section class="section market-workbench"><div class="movers-board" aria-labelledby="movers-title"><div class="board-heading"><div><p class="section-kicker">MOVERS / TAPE</p><h2 id="movers-title">지금 움직이는 종목</h2><p>가격보다 먼저 변화를 발견하고, 종목 상세에서 근거를 확인하세요.</p></div><span class="board-heading-actions"><a class="text-link" href="#/screener" data-route="/screener">조건으로 더 찾기</a><span class="board-asof">${escapeHtml(formatDateTime(overview.asOf))}</span></span></div><div class="table-wrap"><table><caption class="sr-only">주요 종목 시세와 신선도</caption><thead><tr><th scope="col">순위</th><th scope="col">종목</th><th scope="col" class="numeric">가격</th><th scope="col" class="numeric">등락률</th><th scope="col">데이터 상태</th></tr></thead><tbody>${moverRows}</tbody></table></div></div><aside class="evidence-column"><section class="evidence-panel search-panel-wrap"><div class="panel-label">SEARCH THE MARKET</div><h2>읽고 싶은 종목을 찾으세요.</h2><p>종목명이나 6자리 코드로 국내 개별주식을 검색합니다.</p><form class="search-panel" data-search-form><label class="sr-only" for="market-search">종목명 또는 코드</label><input id="market-search" name="q" value="${escapeHtml(state.searchQuery)}" placeholder="예: 삼성전자 또는 005930" ${searchInputAttributes(route)} /><button class="btn btn-primary" type="submit">검색</button></form><p class="search-hint">화살표로 결과를 이동하고 Enter로 엽니다.</p>${searchBlock}</section><section class="evidence-panel"><div class="panel-label">읽을 근거 · READ THE EVIDENCE</div><h2>근거는 숫자 옆에 있습니다.</h2><ul class="evidence-principles"><li><strong>기준 시각</strong><span>값이 언제의 것인지 먼저 확인</span></li><li><strong>출처</strong><span>demo-fixture · 미승인 샌드박스</span></li><li><strong>다음 읽기</strong><span>종목 → 가격 → 수급·뉴스·재무</span></li></ul><a class="text-link" href="#/signals" data-route="/signals">시그널 제공 범위 확인</a></section></aside></section>
      <section class="section scope-strip"><div><p class="section-kicker">RESEARCH DESK</p><h2>국내 개별주식만 다룹니다.</h2></div><p>주문·계좌·자산관리·ETF/ETN/펀드는 제공하지 않습니다. 데이터가 지연되거나 오래된 경우 최신 상태로 해석하지 마세요.</p></section><p class="footer-note">출처: ${escapeHtml(overview.source)} · 시장 기준 시각 ${escapeHtml(formatDateTime(overview.asOf))} · 플랫폼 수신 ${escapeHtml(formatDateTime(overview.receivedAt || overview.asOf))}</p>`;
  } catch (errorValue) { main.innerHTML = `${pageHeading("MARKET OVERVIEW", "오늘의 시장")}${apiErrorMarkup(errorValue, "/market")}`; }
}

function chartMarkup(chart) {
  const values = chart.items.map((item) => item.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 900;
  const height = 240;
  const points = chart.items.map((item, index) => `${Math.round((index / (chart.items.length - 1)) * width)},${Math.round(height - ((item.price - min) / Math.max(max - min, 1)) * (height - 24) - 12)}`);
  const area = `0,${height} ${points.join(" ")} ${width},${height}`;
  return `<div class="chart-box"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">${escapeHtml(chart.ticker)} 1일 가격 흐름</title><desc id="chart-desc">최저 ${formatNumber(min)}원, 최고 ${formatNumber(max)}원. 차트 아래 표에서 동일한 데이터를 확인할 수 있습니다.</desc><line class="chart-grid-line" x1="0" y1="40" x2="900" y2="40"/><line class="chart-grid-line" x1="0" y1="120" x2="900" y2="120"/><line class="chart-grid-line" x1="0" y1="200" x2="900" y2="200"/><polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${points.join(" ")}"/></svg><div class="chart-caption"><span>최저 ${formatNumber(min)}원</span><span>기준 시각 ${escapeHtml(formatDateTime(chart.asOf))}</span><span>최고 ${formatNumber(max)}원</span></div><details class="chart-table"><summary class="btn btn-quiet">차트 데이터 표 보기</summary><div class="table-wrap"><table><caption class="sr-only">차트와 동일한 가격 데이터</caption><thead><tr><th>기준 시각</th><th class="numeric">가격</th></tr></thead><tbody>${chart.items.slice().reverse().map((item) => `<tr><td>${escapeHtml(formatDateTime(item.at))}</td><td class="numeric">${formatNumber(item.price)}원</td></tr>`).join("")}</tbody></table></div></details></div>`;
}

function lockedSignal(ticker, name) {
  return `<div class="signal-lock"><span class="signal-lock-icon" aria-hidden="true">▣</span><div><h3>${escapeHtml(name)} 신호는 구독 권한이 필요합니다</h3><p>실제 방향·강도·정확한 발생 시각·근거·알고리즘 버전은 활성 <strong>REALTIME_SIGNAL</strong> 권한이 있을 때만 반환됩니다.</p></div><ul><li>데이터 신선도와 기준 시각</li><li>신호 상태와 근거 snapshot</li><li>신호 이력과 실시간 스트림</li></ul><div class="page-actions"><a class="btn btn-primary" href="#/subscription" data-route="/subscription">구독 상태 확인</a>${state.role === "guest" ? `<button class="btn btn-secondary" type="button" data-action="sandbox-login">sandbox 로그인</button>` : `<button class="btn btn-secondary" type="button" data-role="member">무료 회원 모드</button>`}</div></div>`;
}

function signalCard(signal, id = "live-signal-card") {
  const displayStatus = signal.effectiveStatus || signal.status;
  const nonActionable = NON_ACTIONABLE_SIGNAL_STATUSES.has(displayStatus);
  const directionClass = nonActionable ? "neutral" : signal.direction === "BUY" ? "up" : signal.direction === "SELL" ? "down" : "neutral";
  const directionLabel = displayStatus === "SUSPENDED" ? "신호 중지" : displayStatus === "EXPIRED" ? "신호 만료" : displayStatus === "CANCELLED" ? "신호 철회" : displayStatus === "VALIDATING" ? "검증 중" : SIGNAL_DIRECTION_LABELS[signal.direction] || signal.direction;
  return `<div id="${id}" class="signal-card"><div class="signal-card-header"><div><div class="signal-direction ${directionClass}">${escapeHtml(directionLabel)} ${!nonActionable ? `<span class="small">${escapeHtml(signal.strength)}</span>` : ""}</div><div class="signal-meta">${signalStatusBadge(displayStatus)}<span>알고리즘 ${escapeHtml(signal.algorithmVersion)}</span></div></div><div class="page-actions"><span class="badge">${escapeHtml(STATUS_LABELS[signal.dataStatus] || signal.dataStatus)}</span><span class="badge" data-stream-connection hidden></span></div></div><div class="grid grid-2"><div><span class="metric-label">발생 시각</span><strong class="small">${escapeHtml(formatDateTime(signal.occurredAt))}</strong></div><div><span class="metric-label">발행 시각</span><strong class="small">${escapeHtml(formatDateTime(signal.publishedAt))}</strong></div><div><span class="metric-label">유효기간</span><strong class="small">${escapeHtml(formatDateTime(signal.validUntil))}</strong></div><div><span class="metric-label">커서</span><strong class="small numeric">${escapeHtml(signal.streamKey)} · ${signal.epoch}/${signal.sequence}</strong></div></div><div><h3>당시 근거 snapshot</h3><ul class="evidence-list">${signal.evidence.map((item) => `<li class="evidence-item"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(item.value)}</span></li>`).join("")}</ul></div><div class="risk">${nonActionable ? "현재 신호 상태가 활성 추천이 아니므로 과거 방향을 최신 추천으로 표시하지 않습니다. " : ""}이 신호는 투자 결과를 보장하지 않으며 주문을 실행하지 않습니다. 기준 시각과 데이터 상태를 확인하세요. (${escapeHtml(signal.riskDisclosureId)})</div></div>`;
}

function signalHistoryMarkup(history) {
  const events = Array.isArray(history?.events) ? history.events.slice().reverse() : [];
  const revisions = Array.isArray(history?.revisions) ? history.revisions.slice().reverse() : [];
  if (!events.length && !revisions.length) return "";
  return `<section class="card" id="signal-history"><div class="section-heading"><div><h2>신호 이력</h2><p class="muted small">발행 이벤트와 당시 평가 revision은 현재 신호와 분리해 보존됩니다.</p></div><span class="badge">${events.length}개 이벤트 · ${revisions.length}개 revision</span></div><div class="table-wrap"><table><caption class="sr-only">신호 발행 이벤트 이력</caption><thead><tr><th>커서</th><th>상태</th><th>방향</th><th>알고리즘</th><th>발생 시각</th><th>발행 시각</th><th>당시 근거</th></tr></thead><tbody>${events.map((event) => `<tr><td class="numeric">${escapeHtml(`${event.epoch}/${event.sequence}`)}</td><td>${signalStatusBadge(event.effectiveStatus || event.status)}</td><td>${escapeHtml(SIGNAL_DIRECTION_LABELS[event.direction] || event.direction)}</td><td>${escapeHtml(event.algorithmVersion)}</td><td class="small">${escapeHtml(formatDateTime(event.occurredAt))}</td><td class="small">${escapeHtml(formatDateTime(event.publishedAt))}</td><td><details><summary class="btn btn-quiet">보기</summary><ul class="evidence-list">${event.evidence.map((item) => `<li class="evidence-item"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(item.value)}</span></li>`).join("")}</ul></details></td></tr>`).join("")}</tbody></table></div><details class="history-revisions"><summary class="btn btn-quiet">평가 revision 보기</summary><div class="table-wrap"><table><caption class="sr-only">신호 평가 revision 이력</caption><thead><tr><th>revision</th><th>상태</th><th>알고리즘</th><th>입력 기준 시각</th><th>근거 수</th></tr></thead><tbody>${revisions.map((revision) => `<tr><td class="numeric">${revision.revision}</td><td>${signalStatusBadge(revision.evaluationStatus)}</td><td>${escapeHtml(revision.algorithmVersion)}</td><td class="small">${escapeHtml(formatDateTime(revision.inputAsOf))}</td><td class="numeric">${revision.evidenceSnapshot.length}</td></tr>`).join("")}</tbody></table></div></details></section>`;
}

function evidenceStockMarkup({ stock, quote, chart, flows, news, financials, signal, ticker, watchlistAction, quoteView }) {
  const chartSection = chart
    ? card("가격 흐름", `<p class="chart-subtitle">가격 흐름과 동일한 데이터를 차트와 표로 확인합니다.</p><div class="chart-with-table">${chartMarkup(chart)}</div><p class="footer-note">${freshness(chart.dataStatus, chart.asOf, chart.source)}</p>`, "evidence-card", "chart")
    : card("가격 흐름", apiErrorMarkup(new Error("가격 흐름을 확인할 수 없습니다.")), "evidence-card", "chart");
  const signalSection = signal?.locked
    ? card("실시간 시그널", lockedSignal(ticker, stock.name), "evidence-card", "signals")
    : signal?.item
      ? `<section class="card evidence-card" id="signals"><div class="section-heading"><h2>실시간 시그널</h2><span class="badge badge-primary">구독 권한 활성</span></div>${signalCard(signal.item)}</section>${signalHistoryMarkup(signal.history)}`
      : card("실시간 시그널", apiErrorMarkup(new Error("신호 상태를 확인할 수 없습니다.")), "evidence-card", "signals");
  const flowSection = flows
    ? card("수급", `<div class="flow-list">${flows.items.map((item) => `<div class="flow-row"><span>${escapeHtml(item.participant)}</span><span class="flow-bar"><span style="width:${Math.min(100, Math.max(14, Math.abs(item.net) / 100000))}%"></span></span><strong class="${item.net >= 0 ? "up" : "down"}">${item.net >= 0 ? "+" : ""}${formatNumber(item.net)} · ${escapeHtml(item.direction)}</strong></div>`).join("")}</div><p class="footer-note">기준 시각 ${escapeHtml(formatDateTime(flows.asOf))} · ${freshness(flows.dataStatus, flows.asOf, flows.source)}</p>`, "evidence-card", "flows")
    : card("수급", `<div class="signal-lock"><h3>로그인 후 수급을 확인할 수 있습니다</h3><p>회원 권한이 필요한 리서치 데이터입니다.</p><button class="btn btn-secondary" type="button" data-action="sandbox-login">sandbox 로그인</button></div>`, "evidence-card", "flows");
  const newsSection = news
    ? card("뉴스", `<ul class="news-list">${news.items.map((item) => `<li><a href="#news" aria-label="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a><span class="news-meta">${escapeHtml(item.source)} · ${escapeHtml(formatDateTime(item.publishedAt))}</span></li>`).join("")}</ul><p class="footer-note">${freshness(news.dataStatus, news.asOf, news.source)}</p>`, "evidence-card", "news")
    : "";
  const financialSection = financials
    ? card("재무 요약", `<div class="table-wrap"><table><caption class="sr-only">재무 요약</caption><thead><tr><th scope="col">지표</th><th scope="col">기간</th><th scope="col" class="numeric">값</th><th scope="col" class="numeric">변화</th></tr></thead><tbody>${financials.items.map((item) => `<tr><td>${escapeHtml(item.metric)}</td><td>${escapeHtml(item.period)}</td><td class="numeric">${escapeHtml(item.value)}</td><td class="numeric">${escapeHtml(item.change)}</td></tr>`).join("")}</tbody></table></div><p class="footer-note">${freshness(financials.dataStatus, financials.asOf, financials.source)}</p>`, "evidence-card", "financials")
    : "";
  return `<section class="stock-header card card-flat stock-dossier-head"><header class="stock-identity"><div><p class="eyebrow">STOCK DOSSIER</p><h1>${escapeHtml(stock.name)}</h1><p class="stock-meta"><span class="stock-code">${escapeHtml(stock.ticker)}</span> · ${escapeHtml(stock.exchange)} · ${escapeHtml(stock.sector)} · ${escapeHtml(stock.securityType)}</p></div><div class="page-actions">${watchlistAction}</div></header><div class="freshness-rail detail-freshness" role="status"><span>${freshness(quote.dataStatus, quote.asOf, quote.source)}</span><span>기준 ${escapeHtml(formatDateTime(quote.asOf))}</span><span>수신 ${escapeHtml(formatDateTime(quote.receivedAt))}</span></div><div class="quote-lead"><div class="quote-lead-main"><span class="metric-label">${escapeHtml(quoteView.priceLabel)}</span><strong class="quote-price">${formatNumber(quote.price)}<span class="quote-unit">원</span></strong><span class="quote-change ${changeClass(quote.change)}">${changeLabel(quote.change)} ${quote.change > 0 ? "+" : ""}${formatNumber(quote.change)}원 · ${quote.changeRate > 0 ? "+" : ""}${quote.changeRate}%</span></div><dl class="quote-lead-facts"><div><dt>거래량</dt><dd>${formatNumber(quote.volume)}주</dd></div><div><dt>거래 상태</dt><dd>${escapeHtml(stock.tradingStatus)}</dd></div><div><dt>데이터 출처</dt><dd>${escapeHtml(quote.source)}</dd></div></dl></div>${quoteView.notice ? `<p class="quote-status-notice ${quoteView.noticeClass}" role="status">${escapeHtml(quoteView.notice)}</p>` : ""}<nav class="detail-tabs" aria-label="종목 상세 섹션"><a aria-current="page" href="#chart" data-anchor="chart">가격</a><a href="#flows" data-anchor="flows">수급</a><a href="#news" data-anchor="news">뉴스</a><a href="#financials" data-anchor="financials">재무</a><a href="#signals" data-anchor="signals">신호</a></nav></section><section class="evidence-grid section content-grid"><div class="stack">${chartSection}${flowSection}${signalSection}</div><div class="stack">${newsSection}${financialSection}${card("출처와 위험 고지", `<p class="small muted">기준 시각 ${escapeHtml(formatDateTime(quote.asOf))} · 플랫폼 수신 시각 ${escapeHtml(formatDateTime(quote.receivedAt))}을 구분해 표시합니다.</p><div class="risk">${escapeHtml(quote.source)}. 데이터가 지연되거나 오래된 경우 최신 상태로 해석하지 마세요. 신호는 투자 결과를 보장하지 않습니다.</div>`, "evidence-card")}</div></section>`;
}

async function renderStock(ticker) {
  const main = document.querySelector("#main-content .main-inner");
  try {
    const results = await Promise.allSettled([api(`/api/v1/stocks/${ticker}`), api(`/api/v1/stocks/${ticker}/chart`), api(`/api/v1/stocks/${ticker}/flows`), api(`/api/v1/stocks/${ticker}/news`), api(`/api/v1/stocks/${ticker}/financials`), api(`/api/v1/stocks/${ticker}/signals`)]);
    const [stockResult, chartResult, flowsResult, newsResult, financialsResult, signalResult] = results;
    if (stockResult.status === "rejected") throw stockResult.reason;
    const stockData = stockResult.value;
    const stock = stockData.stock;
    const quote = stockData.quote;
    const chart = chartResult.status === "fulfilled" ? chartResult.value : null;
    const flows = flowsResult.status === "fulfilled" ? flowsResult.value : null;
    const news = newsResult.status === "fulfilled" ? newsResult.value : null;
    const financials = financialsResult.status === "fulfilled" ? financialsResult.value : null;
    const signal = signalResult.status === "fulfilled" ? signalResult.value : null;
    const quoteView = quotePresentation(quote);
    let isSaved = state.role !== "guest" && Boolean(state.stockSaved?.[ticker]);
    if (state.role !== "guest") {
      const watchlist = await api("/api/v1/watchlists").catch(() => ({ items: [] }));
      isSaved = watchlist.items.some((item) => item.ticker === ticker);
    }
    const watchlistAction = state.role === "guest"
      ? `<button class="btn btn-primary" type="button" data-action="sandbox-login">로그인 후 관심종목 추가</button>`
      : stockWatchlistAction(stock.ticker, isSaved);
    main.innerHTML = `${pageHeading("STOCK RESEARCH", stock.name, `${stock.ticker} · ${stock.exchange} · ${stock.securityType}`, watchlistAction)}<div class="stock-header card card-flat"><div><div class="stock-title"><h2>${escapeHtml(stock.name)}</h2><span class="badge">${escapeHtml(stock.tradingStatus)}</span></div><p class="stock-meta">${escapeHtml(stock.ticker)} · ${escapeHtml(stock.exchange)} · ${escapeHtml(stock.sector)}</p></div><div class="page-actions">${freshness(quote.dataStatus, quote.asOf, quote.source)}</div><div class="quote-summary"><div><span class="metric-label">${escapeHtml(quoteView.priceLabel)}</span><strong class="quote-price">${formatNumber(quote.price)}원</strong></div><div><span class="metric-label">${escapeHtml(quoteView.changeLabel)}</span><strong class="quote-change ${changeClass(quote.change)}">${changeLabel(quote.change)} ${quote.change > 0 ? "+" : ""}${formatNumber(quote.change)}원 (${quote.changeRate > 0 ? "+" : ""}${quote.changeRate}%)</strong></div><div><span class="metric-label">거래량</span><strong class="quote-sub"><strong>${formatNumber(quote.volume)}</strong>주</strong></div><div><span class="metric-label">기준 시각</span><strong class="quote-sub"><strong>${escapeHtml(formatDateTime(quote.asOf))}</strong><br />수신 ${escapeHtml(formatDateTime(quote.receivedAt))}</strong></div></div>${quoteView.notice ? `<p class="quote-status-notice ${quoteView.noticeClass}" role="status">${escapeHtml(quoteView.notice)}</p>` : ""}<nav class="detail-tabs" aria-label="종목 상세 섹션"><a aria-current="page" href="#chart" data-anchor="chart">차트</a><a href="#flows" data-anchor="flows">수급</a><a href="#news" data-anchor="news">뉴스</a><a href="#financials" data-anchor="financials">재무</a><a href="#signals" data-anchor="signals">신호</a></nav></div><section class="section content-grid"><div class="stack">${chart ? card("가격 흐름", `${chartMarkup(chart)}<p class="footer-note">${freshness(chart.dataStatus, chart.asOf, chart.source)}</p>`, "", "chart") : card("가격 흐름", apiErrorMarkup(chartResult.reason), "", "chart")}${signal?.locked ? card("실시간 시그널", lockedSignal(ticker, stock.name), "", "signals") : signal?.item ? `<section class="card" id="signals"><div class="section-heading"><h2>실시간 시그널</h2><span class="badge badge-primary">구독 권한 활성</span></div>${signalCard(signal.item)}</section>${signalHistoryMarkup(signal.history)}` : card("실시간 시그널", apiErrorMarkup(new Error("신호 상태를 확인할 수 없습니다.")), "", "signals")}${flows ? card("수급", `<div class="flow-list">${flows.items.map((item) => `<div class="flow-row"><span>${escapeHtml(item.participant)}</span><span class="flow-bar"><span style="width:${Math.min(100, Math.max(14, Math.abs(item.net) / 100000))}%"></span></span><strong class="${item.net >= 0 ? "up" : "down"}">${item.net >= 0 ? "+" : ""}${formatNumber(item.net)} · ${escapeHtml(item.direction)}</strong></div>`).join("")}</div><p class="footer-note">기준 시각 ${escapeHtml(formatDateTime(flows.asOf))} · ${freshness(flows.dataStatus, flows.asOf, flows.source)}</p>`, "", "flows") : card("수급", `<div class="signal-lock"><h3>로그인 후 수급을 확인할 수 있습니다</h3><p>회원 권한이 필요한 리서치 데이터입니다.</p><button class="btn btn-secondary" type="button" data-action="sandbox-login">sandbox 로그인</button></div>`, "", "flows")} </div><div class="stack">${news ? card("뉴스", `<ul class="news-list">${news.items.map((item) => `<li><a href="#news" aria-label="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a><span class="news-meta">${escapeHtml(item.source)} · ${escapeHtml(formatDateTime(item.publishedAt))}</span></li>`).join("")}</ul><p class="footer-note">${freshness(news.dataStatus, news.asOf, news.source)}</p>`, "", "news") : ""}${financials ? card("재무 요약", `<div class="table-wrap"><table><caption class="sr-only">재무 요약</caption><thead><tr><th>지표</th><th>기간</th><th class="numeric">값</th><th class="numeric">변화</th></tr></thead><tbody>${financials.items.map((item) => `<tr><td>${escapeHtml(item.metric)}</td><td>${escapeHtml(item.period)}</td><td class="numeric">${escapeHtml(item.value)}</td><td class="numeric">${escapeHtml(item.change)}</td></tr>`).join("")}</tbody></table></div><p class="footer-note">${freshness(financials.dataStatus, financials.asOf, financials.source)}</p>`, "", "financials") : ""}${card("출처와 위험 고지", `<p class="small muted">기준 시각 ${escapeHtml(formatDateTime(quote.asOf))} · 플랫폼 수신 시각 ${escapeHtml(formatDateTime(quote.receivedAt))}을 구분해 표시합니다.</p><div class="risk">${escapeHtml(quote.source)}. 데이터가 지연되거나 오래된 경우 최신 상태로 해석하지 마세요. 신호는 투자 결과를 보장하지 않습니다.</div>`)}</div></section>`;
    main.innerHTML = evidenceStockMarkup({ stock, quote, chart, flows, news, financials, signal, ticker, watchlistAction, quoteView });
    if (!financials && state.role === "guest") {
      main.querySelector(".content-grid > .stack:last-child")?.insertAdjacentHTML("afterbegin", card("재무 요약", `<div class="signal-lock"><h3>로그인 후 재무를 확인할 수 있습니다</h3><p>회원 권한이 필요한 리서치 데이터입니다.</p><button class="btn btn-secondary" type="button" data-action="sandbox-login">sandbox 로그인</button></div>`));
    }
    if (chartResult.status === "rejected") main.querySelector("#chart")?.replaceWith(document.createRange().createContextualFragment(card("가격 흐름", retryableErrorMarkup(chartResult.reason, "retry-stock"), "", "chart")));
    if (signalResult.status === "rejected") main.querySelector("#signals")?.replaceWith(document.createRange().createContextualFragment(card("실시간 시그널", retryableErrorMarkup(signalResult.reason, "retry-stock"), "", "signals")));
    if (flowsResult.status === "rejected" && state.role !== "guest") main.querySelector("#flows")?.replaceWith(document.createRange().createContextualFragment(card("수급", retryableErrorMarkup(flowsResult.reason, "retry-stock"), "", "flows")));
    const detailSecondaryStack = main.querySelector(".content-grid > .stack:last-child");
    if (newsResult.status === "rejected") detailSecondaryStack?.insertAdjacentHTML("afterbegin", card("뉴스", retryableErrorMarkup(newsResult.reason, "retry-stock"), "", "news"));
    if (financialsResult.status === "rejected" && state.role !== "guest") detailSecondaryStack?.insertAdjacentHTML("afterbegin", card("재무 요약", retryableErrorMarkup(financialsResult.reason, "retry-stock"), "", "financials"));
    state.stockSaved = state.stockSaved || {};
    state.stockSaved[ticker] = isSaved;
    if (signal && !signal.locked && state.role !== "guest") startStream(ticker);
  } catch (errorValue) { main.innerHTML = `${pageHeading("STOCK RESEARCH", "종목 상세")}${apiErrorMarkup(errorValue, `#/stocks/${ticker}`)}`; }
}

function signalTable(items, locked) {
  return `<div class="table-wrap"><table><caption class="sr-only">실시간 시그널 목록</caption><thead><tr><th>종목</th><th>상태</th><th>데이터</th><th>${locked ? "제공 범위" : "방향"}</th><th>${locked ? "다음 행동" : "발생 시각"}</th></tr></thead><tbody>${items.map((item) => { const displayStatus = item.effectiveStatus || item.status; const nonActionable = NON_ACTIONABLE_SIGNAL_STATUSES.has(displayStatus); const visibleDirection = displayStatus === "SUSPENDED" ? "신호 중지" : displayStatus === "EXPIRED" ? "신호 만료" : displayStatus === "CANCELLED" ? "신호 철회" : displayStatus === "VALIDATING" ? "검증 중" : SIGNAL_DIRECTION_LABELS[item.direction]; return `<tr><td>${stockLink({ ticker: item.ticker, name: item.name || item.ticker })}</td><td>${locked ? `<span class="badge">잠금 미리보기</span>` : signalStatusBadge(displayStatus)}</td><td>${freshness(item.dataStatus, item.asOf)}</td><td>${locked ? `<span class="locked-cell">권한 필요 · 방향 비공개</span>` : `<strong class="${nonActionable ? "neutral" : item.direction === "BUY" ? "up" : item.direction === "SELL" ? "down" : "neutral"}">${escapeHtml(visibleDirection)}</strong>${nonActionable ? "" : ` · ${escapeHtml(item.strength)}`}`}</td><td>${locked ? `<a href="#/subscription" data-route="/subscription">구독 안내</a>` : `<span class="small">${escapeHtml(formatDateTime(item.occurredAt))}</span>`}</td></tr>`; }).join("")}</tbody></table></div>`;
}

async function renderSignals() {
  const main = document.querySelector("#main-content .main-inner");
  try {
    const data = await api("/api/v1/signals");
    const locked = data.locked;
    main.innerHTML = `${pageHeading("REALTIME SIGNALS", "실시간 시그널", locked ? "잠금 상태에서도 제공 범위와 권한 차이를 확인할 수 있습니다." : "구독 권한이 있는 경우에만 방향·근거·이력을 확인할 수 있습니다.", locked ? `<a class="btn btn-primary" href="#/subscription" data-route="/subscription">구독 상태 확인</a>` : "")}${locked ? `<div class="connection-banner"><span><strong>잠금 미리보기</strong> 실제 방향·강도·정확한 이벤트 시각과 근거는 응답에 포함되지 않습니다.</span><span class="badge">REALTIME_SIGNAL 필요</span></div>` : `<div id="stream-banner" class="connection-banner" role="status" aria-live="polite"><span><strong>실시간 연결 준비</strong> 구독 권한과 스트림 상태를 확인합니다.</span><button class="btn btn-quiet" type="button" data-action="demo-gap">gap 복구 시뮬레이션</button></div>`}<section class="card"><div class="signal-table-actions"><div><h2>신호 제공 종목</h2><p class="muted small">기준 시각 ${escapeHtml(formatDateTime(data.asOf))} · ${escapeHtml(STATUS_LABELS[data.dataStatus])}</p></div><div class="filter-row"><span class="badge">종목 전체</span><span class="badge">기본 전략</span></div></div>${signalTable(data.items, locked)}</section>${locked ? card("프리미엄 필드 보호", `<p class="small muted">무료 사용자는 방향 필드를 제거한 응답만 받습니다. 방향을 추론할 수 있는 필터·정렬·집계·차트 마커도 제공하지 않습니다.</p><div class="risk">신호는 투자 결과를 보장하지 않으며 주문을 실행하지 않습니다.</div>`) : ""}`;
    if (!locked) startStream("005930");
  } catch (errorValue) { main.innerHTML = `${pageHeading("REALTIME SIGNALS", "실시간 시그널")}${apiErrorMarkup(errorValue, "/signals")}`; }
}

async function renderScreener() {
  const main = document.querySelector("#main-content .main-inner");
  if (state.role === "guest") {
    main.innerHTML = `${pageHeading("STRUCTURED SCREENER", "조건 스크리너", "승인된 구조화 조건으로 종목을 찾습니다.")}${lockedSignal("", "조건 스크리너")}`;
    return;
  }
  try {
    const conditions = await api("/api/v1/screener/conditions");
    const values = state.screener?.query || { market: "ALL", priceChange: "ANY", volume: "ANY" };
    const screenerErrorBlock = state.screenerError ? retryableErrorMarkup(state.screenerError, "retry-screener", "screener-error") : "";
    const resultBlock = state.screener ? `<section class="section">${card("검색 결과", `<div class="section-heading"><p>결과 기준 시각 ${escapeHtml(formatDateTime(state.screener.asOf))} · ${escapeHtml(STATUS_LABELS[state.screener.dataStatus])}</p></div>${state.screener.items.length ? `<div class="table-wrap"><table><caption class="sr-only">스크리너 결과</caption><thead><tr><th>종목</th><th>시장</th><th class="numeric">가격</th><th class="numeric">등락률</th><th>신선도</th></tr></thead><tbody>${state.screener.items.map((item) => `<tr><td>${stockLink(item)}</td><td>${escapeHtml(item.exchange)}</td><td class="numeric">${quotePriceCell(item.quote)}</td><td class="numeric">${quoteRateCell(item.quote)}</td><td>${freshness(item.quote.dataStatus, item.quote.asOf, item.quote.source)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><h3>조건에 맞는 종목이 없습니다</h3><p>조건을 완화하거나 다른 조합을 시도해 주세요.</p></div>`}<p class="footer-note">${state.screener.limitations.map(escapeHtml).join(" · ")}</p>`)}</section>` : "";
    main.innerHTML = `${pageHeading("STRUCTURED SCREENER", "조건 스크리너", "자연어 입력과 저장 필터 없이, 승인된 조건만 조합합니다.")}${screenerErrorBlock}${card("조건 선택", `<form class="screener-form" data-screener-form>${conditions.items.map((condition) => `<div class="field"><label for="condition-${condition.id}">${escapeHtml(condition.label)}</label><select id="condition-${condition.id}" name="${condition.id}">${condition.options.map((option) => `<option value="${escapeHtml(option.value)}" ${values[condition.id] === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></div>`).join("")}<button class="btn btn-primary" type="submit">결과 보기</button></form><div class="condition-summary">${conditions.items.map((condition) => `<span class="condition-chip">${escapeHtml(condition.label)}: ${escapeHtml(condition.options.find((option) => option.value === values[condition.id])?.label || "전체")}</span>`).join("")}</div><p class="footer-note">조건 오류·빈 결과·지연 상태를 별도로 안내합니다. 자연어 조건과 저장 필터는 MVP 범위에 포함하지 않습니다.</p>`)}${resultBlock}`;
  } catch (errorValue) {
    if (state.role === "guest" && errorValue.status === 401) return render();
    main.innerHTML = `${pageHeading("STRUCTURED SCREENER", "조건 스크리너")}${apiErrorMarkup(errorValue, "/screener")}`;
  }
}

async function renderWatchlist() {
  const main = document.querySelector("#main-content .main-inner");
  if (state.role === "guest") {
    main.innerHTML = `${pageHeading("WATCHLIST", "관심종목", "저장·재방문·삭제는 회원 기능입니다.")}${lockedSignal("", "관심종목")}`;
    return;
  }
  try {
    const data = await api("/api/v1/watchlists");
    main.innerHTML = `${pageHeading("WATCHLIST", "관심종목", "서버에 저장된 목록을 다시 조회합니다.")}${watchlistErrorMarkup()}${data.items.length ? `<section class="card"><div class="table-wrap"><table><caption class="sr-only">관심종목 목록</caption><thead><tr><th>종목</th><th class="numeric">가격</th><th class="numeric">등락률</th><th>신선도</th><th><span class="sr-only">작업</span></th></tr></thead><tbody>${data.items.map((item) => `<tr><td>${stockLink(item)}</td><td class="numeric">${quotePriceCell(item.quote)}</td><td class="numeric">${quoteRateCell(item.quote)}</td><td>${freshness(item.quote.dataStatus, item.quote.asOf, item.quote.source)}</td><td>${watchlistRemoveButton(item.ticker)}</td></tr>`).join("")}</tbody></table></div><p class="footer-note">목록 기준 시각 ${escapeHtml(formatDateTime(data.asOf))} · 삭제는 확인 후 서버에 반영됩니다.</p></section>` : `<div class="empty-state"><span class="badge">EMPTY</span><h3>아직 저장한 종목이 없습니다</h3><p>시장이나 검색에서 종목을 열고 관심종목에 추가해 보세요.</p><a class="btn btn-primary" href="#/market" data-route="/market">시장으로 이동</a></div>`}`;
  } catch (errorValue) {
    if (state.role === "guest" && errorValue.status === 401) return render();
    main.innerHTML = `${pageHeading("WATCHLIST", "관심종목")}${apiErrorMarkup(errorValue, "/watchlist")}`;
  }
}

function subscriptionStatusDescription(subscription, entitlementActive, pending) {
  if (pending) return "결제가 접수되었지만 권한 확인 중입니다. 잠시 후 상태를 다시 조회합니다.";
  if (subscription.status === "SUSPENDED") return "결제 provider 또는 운영 정책에 의해 구독이 일시 정지되었습니다. 재활성화 결과를 확인하기 전에는 실제 신호 권한이 없습니다.";
  if (subscription.status === "CANCELLATION_SCHEDULED") return "자동 갱신이 해지 예정입니다. 종료 시각 전까지 현재 권한이 유지됩니다.";
  if (subscription.status === "REFUND_PENDING") return "환불 처리를 기다리는 중입니다. 환불 후 권한 정책은 결제 공급자 결과를 따릅니다.";
  if (subscription.status === "PAYMENT_FAILED") return "결제가 완료되지 않았습니다. 결제수단을 확인한 뒤 다시 시도해 주세요.";
  if (entitlementActive) return "서버가 REALTIME_SIGNAL 권한을 활성 상태로 판정했습니다.";
  return subscription.status === "EXPIRED" ? "구독 기간이 종료되어 실제 신호 권한이 없습니다." : "현재 실제 신호 권한이 없습니다.";
}

function subscriptionActionMarkup(subscription, entitlementActive, pending) {
  if (pending) return `<button class="btn btn-secondary" type="button" disabled>결제 처리중</button>`;
  if (subscription.status === "SUSPENDED") return `<button class="btn btn-secondary" type="button" disabled>provider 확인 필요</button>`;
  if (subscription.status === "CANCELLATION_SCHEDULED") return `<span class="badge badge-warning">${escapeHtml(formatDateTime(subscription.cancelAt || subscription.endsAt))} 종료 예정</span>`;
  if (subscription.status === "REFUND_PENDING") return `<button class="btn btn-secondary" type="button" disabled>환불 처리중</button>`;
  if (subscription.status === "PAYMENT_FAILED") return `<button class="btn btn-primary" type="button" data-action="checkout">결제 다시 시도</button>`;
  if (entitlementActive) return `<button class="btn btn-secondary" type="button" data-action="cancel-subscription">기간 종료 시 해지</button>`;
  return `<button class="btn btn-primary" type="button" data-action="checkout">sandbox 구독 시작</button>`;
}

async function renderSubscription() {
  const main = document.querySelector("#main-content .main-inner");
  if (state.role === "guest") {
    main.innerHTML = `${pageHeading("SUBSCRIPTION & ACCOUNT", "구독·계정", "로그인과 구독 권한 상태를 확인하는 화면입니다.")}${lockedSignal("", "구독·계정")}`;
    return;
  }
  try {
    const [subscriptionData, entitlementData] = await Promise.all([api("/api/v1/subscriptions/me"), api("/api/v1/entitlements/me")]);
    const subscription = subscriptionData.subscription;
    const entitlement = entitlementData.items[0];
    const active = entitlement.status === "ACTIVE";
    const pending = subscription.status === "PENDING";
    const subscriptionErrorBlock = state.subscriptionError ? retryableErrorMarkup(state.subscriptionError.error, "retry-subscription") : "";
    if (pending) window.setTimeout(render, 900);
    main.innerHTML = `${pageHeading("SUBSCRIPTION & ACCOUNT", "구독·계정", "결제 상태와 서버 entitlement 권한은 별도로 확인합니다.")}${subscriptionErrorBlock}${card("실시간 시그널 구독", `<div class="subscription-card"><div><p class="eyebrow">REALTIME_SIGNAL</p><h2>근거와 이력을 함께 확인하는 월 구독</h2><p class="lede">실제 공급자 연동 전 샌드박스 흐름입니다. 결제 완료 화면만으로 권한을 활성화하지 않고 서버 entitlement 확인 후 신호에 접근합니다.</p><div class="price">₩19,000 <small>/ 월 · 데모 가격</small></div><ul class="benefit-list"><li>신호 방향·강도·상태</li><li>발생·발행 시각과 유효기간</li><li>알고리즘 버전과 evidence snapshot</li><li>실시간 연결·replay/resync 상태</li></ul></div><div class="state-card"><h3>현재 상태 <span class="badge ${active ? "badge-primary" : pending ? "badge-warning" : subscription.status === "PAYMENT_FAILED" ? "badge-error" : subscription.status === "SUSPENDED" ? "badge-warning" : ""}">${escapeHtml(subscription.status)}</span></h3><p>${escapeHtml(subscriptionStatusDescription(subscription, active, pending))}</p><dl><dt>권한</dt><dd>${escapeHtml(entitlement.status)}</dd><dt>종료 시각</dt><dd>${escapeHtml(formatDateTime(entitlement.effectiveUntil || subscription.endsAt))}</dd><dt>자동 갱신</dt><dd>${subscription.autoRenew ? "설정됨" : "해지 예정"}</dd></dl>${subscriptionActionMarkup(subscription, active, pending)}</div></div>`)}<section class="section grid grid-2">${card("상태 안내", `<ul class="benefit-list"><li><strong>PENDING</strong> 결제 확인과 entitlement 반영을 기다리는 상태</li><li><strong>ACTIVE</strong> 서버 권한이 확인된 상태</li><li><strong>CANCELLATION_SCHEDULED</strong> 종료 시각까지 정책상 권한 유지</li><li><strong>REFUND_PENDING</strong> 환불 처리와 권한 정책을 확인하는 상태</li><li><strong>PAYMENT_FAILED</strong> 결제 실패 원인과 재시도 행동을 확인하는 상태</li><li><strong>SUSPENDED</strong> provider 재활성화 전까지 신호 권한이 중지된 상태</li><li><strong>EXPIRED</strong> 신호 접근이 잠긴 상태</li></ul>`)}${card("위험 고지", `<div class="risk">알고리즘 신호는 투자 권유나 주문 실행이 아니며 투자 결과를 보장하지 않습니다. 데이터 지연·오류·신호 유효기간을 반드시 확인하세요.</div><p class="footer-note">자동 갱신·환불·가격은 승인된 결제 공급자 정책 확정 전 데모 값입니다.</p>`)}</section>`;
  } catch (errorValue) {
    if (state.role === "guest" && errorValue.status === 401) return render();
    main.innerHTML = `${pageHeading("SUBSCRIPTION & ACCOUNT", "구독·계정")}${apiErrorMarkup(errorValue, "/subscription")}`;
  }
}

function closeStream() {
  if (state.stream.source) state.stream.source.close();
  state.stream = { source: null, ticker: null, lastCursor: null, lastReceivedAt: null, status: "idle", demoGap: false };
}

function markStreamHealthy() {
  state.stream.lastReceivedAt = new Date().toISOString();
}

function markStreamDegraded() {
  if (!state.liveSignal || state.liveSignal.dataStatus === "STALE") return;
  state.liveSignal = { ...state.liveSignal, dataStatus: "STALE" };
  const cardElement = document.querySelector("#live-signal-card");
  if (cardElement) cardElement.outerHTML = signalCard(state.liveSignal);
}

function setStreamBanner(message, type = "") {
  renderStreamConnectionBadge();
  const banner = document.querySelector("#stream-banner");
  if (!banner) return;
  banner.className = `connection-banner ${type}`;
  banner.innerHTML = `<span><strong>${escapeHtml(message)}</strong> 마지막 정상 수신 ${escapeHtml(formatDateTime(state.stream.lastReceivedAt))}</span><button class="btn btn-quiet" type="button" data-action="retry-stream">재연결</button>`;
}

function renderStreamConnectionBadge() {
  const labels = { connecting: ["연결 중", "badge-primary"], reconnecting: ["연결 복구 중", "badge-warning"], resyncing: ["데이터 복구 중", "badge-warning"], revoked: ["권한 회수됨", "badge-error"] };
  const [label, type] = labels[state.stream.status] || [];
  document.querySelectorAll("[data-stream-connection]").forEach((badge) => {
    badge.hidden = !label;
    badge.textContent = label || "";
    badge.className = `badge ${type || ""}`;
  });
}

function updateLiveSignal(signal) {
  state.liveSignal = signal;
  const cardElement = document.querySelector("#live-signal-card");
  if (cardElement) cardElement.outerHTML = signalCard(signal);
  announce(`신호 업데이트: ${SIGNAL_DIRECTION_LABELS[signal.direction] || signal.direction}, ${STATUS_LABELS[signal.status] || signal.status}`);
}

function resyncStream() {
  const ticker = state.stream.ticker;
  if (!ticker) return;
  const previousCursor = state.stream.lastCursor;
  state.stream.status = "resyncing";
  markStreamDegraded();
  setStreamBanner("순번 간격을 감지했습니다. 최신 snapshot을 확인하는 중입니다.", "warning");
  const replayPath = `/api/v1/stream/replay?streamKey=${encodeURIComponent(previousCursor.streamKey)}&epoch=${previousCursor.epoch}&afterSequence=${previousCursor.sequence}`;
  api(replayPath).then(async (replay) => {
    if (replay.replayable) {
      for (const event of replay.events) {
        const cursor = { streamKey: event.streamKey, epoch: event.epoch, sequence: event.sequence };
        if (state.stream.lastCursor && shouldIgnoreCursor(state.stream.lastCursor, cursor)) continue;
        state.stream.lastCursor = cursor;
        updateLiveSignal(event);
      }
      state.stream.demoGap = false;
      startStream(ticker);
      announce("누락 이벤트를 replay해 스트림을 복구했습니다.");
      return;
    }
    const snapshot = replay.snapshot?.item;
    if (snapshot) {
      state.stream.lastCursor = { streamKey: snapshot.streamKey, epoch: snapshot.epoch, sequence: snapshot.sequence };
      updateLiveSignal(snapshot);
    } else {
      const data = await api(`/api/v1/stocks/${ticker}/signals`);
      if (data.item) {
        state.stream.lastCursor = { streamKey: data.item.streamKey, epoch: data.item.epoch, sequence: data.item.sequence };
        updateLiveSignal(data.item);
      }
    }
    state.stream.demoGap = false;
    startStream(ticker);
    announce("replay가 만료되어 최신 snapshot으로 스트림을 복구했습니다.");
  }).catch((errorValue) => setStreamBanner(`복구할 수 없습니다: ${errorValue.message}`, "error"));
}

function startStream(ticker) {
  if (state.role === "guest") return;
  const lastReceivedAt = state.stream.lastReceivedAt;
  const resumeCursor = state.stream.lastCursor;
  if (state.stream.source) state.stream.source.close();
  state.stream = { source: null, ticker, lastCursor: resumeCursor, lastReceivedAt, status: "connecting", demoGap: state.stream.demoGap };
  renderStreamConnectionBadge();
  const params = new URLSearchParams({ ticker, role: state.role, userId: USER_ID });
  if (state.stream.demoGap) params.set("demoGap", "1");
  if (resumeCursor) {
    params.set("streamKey", resumeCursor.streamKey);
    params.set("epoch", String(resumeCursor.epoch));
    params.set("afterSequence", String(resumeCursor.sequence));
  }
  const source = new EventSource(`/api/v1/stream?${params}`);
  state.stream.source = source;
  source.onopen = () => { markStreamHealthy(); state.stream.status = "connected"; setStreamBanner("실시간 스트림 연결됨"); };
  source.onerror = () => { state.stream.status = "reconnecting"; markStreamDegraded(); setStreamBanner("스트림 재연결 중입니다. 마지막 값은 최신값으로 강조하지 않습니다.", "warning"); };
  source.addEventListener("connection.ready", (event) => {
    const data = JSON.parse(event.data);
    markStreamHealthy();
    state.stream.lastCursor = data.snapshotCursor;
    state.stream.status = "connected";
    setStreamBanner("실시간 스트림 연결됨");
  });
  source.addEventListener("signal.snapshot", (event) => {
    const data = JSON.parse(event.data);
    markStreamHealthy();
    const cursor = data.snapshotCursor;
    if (state.stream.lastCursor && shouldIgnoreCursor(state.stream.lastCursor, cursor)) return;
    state.stream.lastCursor = cursor;
    updateLiveSignal(data.item);
  });
  source.addEventListener("signal.changed", (event) => {
    const data = JSON.parse(event.data);
    markStreamHealthy();
    const cursor = { streamKey: data.streamKey, epoch: data.epoch, sequence: data.sequence };
    if (state.stream.lastCursor && shouldIgnoreCursor(state.stream.lastCursor, cursor)) return;
    if (state.stream.lastCursor && hasCursorGap(state.stream.lastCursor, cursor)) return resyncStream();
    state.stream.lastCursor = cursor;
    updateLiveSignal(data);
  });
  source.addEventListener("entitlement.revoked", (event) => {
    const data = JSON.parse(event.data);
    source.close();
    state.stream.source = null;
    state.stream.status = "revoked";
    if (data.reason === "LOGOUT") {
      resetClientSession();
    }
    announce(`실시간 권한이 회수되어 스트림을 종료했습니다. (${data.reason || "권한 상태 변경"})`);
    render();
  });
}

async function handleSearch(form) {
  const query = new FormData(form).get("q")?.toString().trim() || "";
  state.searchQuery = query;
  state.searchActiveIndex = -1;
  state.searchError = null;
  if (!query) {
    state.searchResults = [];
    if (location.hash === "#/market" || !location.hash) render();
    else navigate("/market");
    return;
  }
  try {
    const data = await api(`/api/v1/stocks/search?q=${encodeURIComponent(query)}`);
    state.searchResults = data.items;
    state.searchError = null;
    if (data.items.length === 1) navigate(`/stocks/${data.items[0].ticker}`);
    else navigate("/market");
  } catch (errorValue) {
    state.searchResults = [];
    state.searchError = errorValue;
    announce(`${errorValue.message} (${errorValue.code})`);
    if (routeFromHash().name !== "market") navigate("/market");
    else render();
  }
}

function syncSearchSelection() {
  const activeTicker = state.searchResults[state.searchActiveIndex]?.ticker;
  document.querySelectorAll("[data-search-input]").forEach((input) => input.setAttribute("aria-activedescendant", activeTicker ? searchResultId(activeTicker) : ""));
  document.querySelectorAll("[data-search-result-index]").forEach((result, index) => result.setAttribute("aria-selected", String(index === state.searchActiveIndex)));
}

function handleSearchKeydown(event) {
  const input = event.target.closest("[data-search-input]");
  if (!input || !document.querySelector("#search-results") || !state.searchResults.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    state.searchActiveIndex = (state.searchActiveIndex + delta + state.searchResults.length) % state.searchResults.length;
    syncSearchSelection();
    return;
  }
  if (event.key === "Enter" && state.searchActiveIndex >= 0) {
    event.preventDefault();
    navigate(`/stocks/${state.searchResults[state.searchActiveIndex].ticker}`);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    state.searchResults = [];
    state.searchActiveIndex = -1;
    render();
  }
}

async function handleScreener(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  state.screenerError = null;
  try {
    state.screener = await api("/api/v1/screener/query", { method: "POST", body: values });
    render();
  } catch (errorValue) {
    if (errorValue.status === 401) return render();
    state.screenerError = errorValue;
    announce(`${errorValue.message} (${errorValue.code})`);
    render();
  }
}

async function addWatchlist(ticker) {
  if (state.watchlistPending) return;
  state.watchlistError = null;
  state.watchlistPending = { action: "add", ticker };
  render();
  try {
    const result = await api("/api/v1/watchlists", { method: "POST", headers: { "Idempotency-Key": idempotencyKey("watchlist-add") }, body: { ticker } });
    announce(result.duplicate ? "이미 관심종목에 저장된 종목입니다." : "관심종목에 저장했습니다.");
    state.stockSaved = { ...(state.stockSaved || {}), [ticker]: true };
    state.watchlistError = null;
  } catch (errorValue) {
    if (errorValue.status === 401) resetClientSession("세션이 만료되었습니다. 현재 작업을 유지한 채 다시 로그인해 주세요.");
    else {
      state.watchlistError = { ticker, message: errorValue.message, code: errorValue.code, requestId: errorValue.requestId || "-" };
      announce(`${errorValue.message} (${errorValue.code})`);
    }
  } finally {
    state.watchlistPending = null;
    render();
  }
}

async function removeWatchlist(ticker) {
  if (state.watchlistPending) return;
  if (!await confirmAction({ title: "관심종목 삭제", message: "이 종목을 관심종목에서 삭제할까요?", confirmLabel: "삭제", danger: true })) return;
  state.watchlistError = null;
  state.watchlistPending = { action: "remove", ticker };
  render();
  try {
    await api(`/api/v1/watchlists/${encodeURIComponent(`watchlist-${USER_ID}`)}/items/${ticker}`, { method: "DELETE", headers: { "Idempotency-Key": idempotencyKey("watchlist-remove") } });
    announce("관심종목에서 삭제했습니다.");
    state.stockSaved = { ...(state.stockSaved || {}), [ticker]: false };
    state.watchlistError = null;
  } catch (errorValue) {
    if (errorValue.status === 401) resetClientSession("세션이 만료되었습니다. 현재 작업을 유지한 채 다시 로그인해 주세요.");
    else {
      state.watchlistError = { ticker, message: errorValue.message, code: errorValue.code, requestId: errorValue.requestId || "-" };
      announce(`${errorValue.message} (${errorValue.code})`);
    }
  } finally {
    state.watchlistPending = null;
    render();
  }
}

async function checkout() {
  state.subscriptionError = null;
  try { await api("/api/v1/subscriptions/checkout", { method: "POST", headers: { "Idempotency-Key": idempotencyKey("checkout") }, body: { plan: "ALGORITHM_SIGNAL_MONTHLY" } }); announce("결제 처리중입니다. 서버 권한을 확인합니다."); render(); } catch (errorValue) { if (errorValue.status === 401) render(); else { state.subscriptionError = { error: errorValue, action: "checkout" }; announce(`${errorValue.message} (${errorValue.code})`); render(); } }
}

async function cancelSubscription() {
  if (!await confirmAction({ title: "구독 해지 예정", message: "현재 결제 주기 종료 시 자동 갱신을 해지할까요?", confirmLabel: "해지 예정", danger: true })) return;
  state.subscriptionError = null;
  try { await api("/api/v1/subscriptions/cancel", { method: "POST", headers: { "Idempotency-Key": idempotencyKey("cancel") }, body: {} }); announce("해지 예정 상태로 변경했습니다."); render(); } catch (errorValue) { if (errorValue.status === 401) render(); else { state.subscriptionError = { error: errorValue, action: "cancel" }; announce(`${errorValue.message} (${errorValue.code})`); render(); } }
}

async function sandboxLogin() {
  if (!state.session.authenticated) state.returnRoute = safeReturnRoute(location.hash);
  state.authError = null;
  state.sessionError = null;
  renderSessionNotice();
  try {
    const data = await api("/api/v1/auth/demo/session", { method: "POST", body: { userId: USER_ID } });
    state.session = { authenticated: true, csrfToken: data.csrfToken, userId: data.userId, role: data.role };
    state.role = data.role;
    state.authError = null;
    state.sessionNotice = "";
    localStorage.setItem("demo-role", state.role);
    announce("sandbox 세션으로 로그인했습니다.");
    const returnRoute = state.returnRoute;
    state.returnRoute = "";
    if (returnRoute && returnRoute !== safeReturnRoute(location.hash)) navigate(returnRoute);
    else render();
  } catch (errorValue) {
    state.authError = { message: errorValue.message, code: errorValue.code, requestId: errorValue.requestId || "-" };
    announce(`${errorValue.message} (${errorValue.code})`);
    renderSessionNotice();
  }
}

async function logoutSession() {
  state.sessionError = null;
  renderSessionNotice();
  try {
    await api("/api/v1/auth/logout", { method: "POST" });
    resetClientSession();
    announce("세션을 로그아웃했습니다.");
    render();
  } catch (errorValue) {
    if (errorValue.status === 401) return;
    state.sessionError = { message: errorValue.message, code: errorValue.code, requestId: errorValue.requestId || "-" };
    announce(`${errorValue.message} (${errorValue.code})`);
    renderSessionNotice();
  }
}

async function syncSession() {
  try {
    const data = await api("/api/v1/auth/me");
    if (!data.authenticated) return;
    state.session = { authenticated: true, csrfToken: data.csrfToken, userId: data.userId, role: data.role };
    state.role = data.role;
    localStorage.setItem("demo-role", state.role);
  } catch {
    state.session = { authenticated: false, csrfToken: null, userId: null, role: null };
  }
}

async function render() {
  const route = routeFromHash();
  closeStream();
  renderShell(route);
  if (route.name === "market") return renderMarket();
  if (route.name === "signals") return renderSignals();
  if (route.name === "screener") return renderScreener().finally(() => { if (state.screenerError) document.querySelector("[data-screener-form]")?.setAttribute("aria-describedby", "screener-error"); });
  if (route.name === "watchlist") return renderWatchlist();
  if (route.name === "subscription") return renderSubscription();
  if (route.name === "stock") return renderStock(route.ticker);
}

document.addEventListener("click", (event) => {
  const roleButton = event.target.closest("[data-role]");
  if (roleButton && roleButton.tagName === "BUTTON") {
    event.preventDefault();
    state.role = roleButton.dataset.role;
    state.authError = null;
    state.sessionError = null;
    state.sessionNotice = "";
    localStorage.setItem("demo-role", state.role);
    state.searchResults = [];
    announce(`${ROLE_LABELS[state.role]} 모드로 전환했습니다.`);
    render();
    return;
  }
  const anchorLink = event.target.closest("[data-anchor]");
  if (anchorLink) {
    event.preventDefault();
    document.querySelectorAll(".detail-tabs a[data-anchor]").forEach((link) => link.setAttribute("aria-current", link === anchorLink ? "page" : "false"));
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(anchorLink.dataset.anchor)?.scrollIntoView({ behavior, block: "start" });
    return;
  }
  const routeLink = event.target.closest("[data-route]");
  if (routeLink) {
    event.preventDefault();
    navigate(routeLink.dataset.route);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "add-watchlist") addWatchlist(action.dataset.ticker);
  if (action.dataset.action === "remove-watchlist") removeWatchlist(action.dataset.ticker);
  if (action.dataset.action === "checkout") checkout();
  if (action.dataset.action === "cancel-subscription") cancelSubscription();
  if (action.dataset.action === "sandbox-login") sandboxLogin();
  if (action.dataset.action === "retry-login") sandboxLogin();
  if (action.dataset.action === "retry-logout") logoutSession();
  if (action.dataset.action === "dismiss-auth-error") { state.authError = null; renderSessionNotice(); }
  if (action.dataset.action === "dismiss-session-error") { state.sessionError = null; renderSessionNotice(); }
  if (action.dataset.action === "dismiss-session-notice") { state.sessionNotice = ""; renderSessionNotice(); }
  if (action.dataset.action === "logout") logoutSession();
  if (action.dataset.action === "retry-search") { const form = document.querySelector("[data-search-form]"); if (form) handleSearch(form); }
  if (action.dataset.action === "retry-screener") { const form = document.querySelector("[data-screener-form]"); if (form) handleScreener(form); }
  if (action.dataset.action === "retry-stock") render();
  if (action.dataset.action === "retry-subscription") state.subscriptionError?.action === "cancel" ? cancelSubscription() : checkout();
  if (action.dataset.action === "retry-stream") startStream(state.stream.ticker || "005930");
  if (action.dataset.action === "demo-gap") { state.stream.demoGap = true; startStream("005930"); }
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("[data-search-form]")) { event.preventDefault(); handleSearch(event.target); }
  if (event.target.matches("[data-screener-form]")) { event.preventDefault(); handleScreener(event.target); }
});

document.addEventListener("keydown", handleSearchKeydown);

window.addEventListener("hashchange", render);
window.addEventListener("beforeunload", closeStream);
if (!location.hash) location.hash = "#/market";
syncSession().finally(render);
