import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function asset(name) {
  return readFile(new URL(`../public/${name}`, import.meta.url), "utf8");
}

test("shell exposes keyboard skip navigation and a polite live region", async () => {
  const html = await asset("index.html");
  const app = await asset("app.js");
  assert.match(html, /class="skip-link"[^>]+href="#main-content"/);
  assert.match(html, /id="live-region"[^>]+aria-live="polite"/);
  assert.match(app, /<main id="main-content"/);
});

test("research desk shell exposes task navigation and an accessible market rail", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /class="research-shell"/);
  assert.match(app, /class="sidebar"/);
  assert.match(app, /class="market-rail/);
  assert.match(app, /aria-label="시장 테이프"/);
  assert.match(app, /class="bottom-nav"/);
  assert.match(css, /--surface-1/);
  assert.match(css, /\.market-rail/);
});

test("approved market semantics pair rise and fall colors with text labels", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /changeLabel\(index\.change\)/);
  assert.match(app, /changeLabel\(quote\.change\)/);
  assert.match(css, /--rise:/);
  assert.match(css, /--fall:/);
});

test("client provides an equivalent table for the SVG chart and status text", async () => {
  const app = await asset("app.js");
  assert.match(app, /role="img" aria-labelledby="chart-title chart-desc"/);
  assert.match(app, /동일한 데이터를/);
  assert.match(app, /role="status"/);
  assert.match(app, /aria-hidden="true"/);
});

test("stock quotes distinguish current values from delayed or unavailable values", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /function quotePresentation\(quote\)/);
  assert.match(app, /priceLabel: "마지막 확인 가격"/);
  assert.match(app, /dataStatus === "UNAVAILABLE"/);
  assert.match(app, /quote-status-notice/);
  assert.match(app, /function quotePriceCell\(quote\)/);
  assert.match(app, /function quoteRateCell\(quote\)/);
  assert.match(app, /freshness\(item\.quote\.dataStatus, item\.quote\.asOf, item\.quote\.source\)/);
  assert.match(app, /최신값으로 해석하지 마세요/);
  assert.match(css, /\.quote-status-notice\.error/);
});

test("stock detail tabs stay in-page and expose anchored content sections", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /data-anchor="chart"/);
  assert.match(app, /data-anchor="flows"/);
  assert.match(app, /data-anchor="news"/);
  assert.match(app, /data-anchor="financials"/);
  assert.match(app, /data-anchor="signals"/);
  assert.match(app, /getElementById\(anchorLink\.dataset\.anchor\)/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /aria-current/,);
  assert.match(app, /card\("가격 흐름"[^\n]+"chart"/);
  assert.match(app, /card\("수급"[^\n]+"flows"/);
  assert.match(app, /retry-stock/);
  assert.match(app, /flowsResult\.status === "rejected"/);
  assert.match(app, /financialsResult\.status === "rejected"/);
  assert.match(css, /scroll-margin-top/);
});

test("client separates entitlement revocation from ordinary stream reconnects", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /role: localStorage\.getItem\("demo-role"\) \|\| "guest"/);
  assert.match(app, /addEventListener\("entitlement\.revoked"/);
  assert.match(app, /실시간 권한이 회수되어 스트림을 종료했습니다/);
  assert.match(app, /data\.reason === "LOGOUT"/);
  assert.match(app, /현재 작업을 유지한 채 다시 로그인해 주세요/);
  assert.match(app, /NON_ACTIONABLE_SIGNAL_STATUSES/);
  assert.match(app, /신호 철회/);
  assert.match(app, /로그인 후 관심종목 추가/);
  assert.doesNotMatch(app, /sandbox 로그인/);
  assert.doesNotMatch(app, /data-role=/);
  assert.match(app, /session-notice-root/);
  assert.match(app, /세션이 만료되었습니다\. 현재 작업을 유지한 채 다시 로그인해 주세요/);
  assert.match(app, /data-action="sandbox-login">다시 로그인/);
  assert.match(app, /function safeReturnRoute/);
  assert.match(app, /state\.returnRoute = safeReturnRoute\(location\.hash\)/);
  assert.match(app, /if \(returnRoute && returnRoute !== safeReturnRoute\(location\.hash\)\) navigate\(returnRoute\)/);
  assert.match(app, /authError/);
  assert.match(app, /data-action="retry-login">다시 로그인/);
  assert.match(app, /data-action="dismiss-auth-error">닫기/);
  assert.match(app, /로그인할 수 없습니다/);
  assert.match(app, /sessionError/);
  assert.match(app, /data-action="retry-logout">다시 로그아웃/);
  assert.match(app, /data-action="dismiss-session-error">닫기/);
  assert.match(app, /로그아웃할 수 없습니다/);
  assert.match(css, /\.session-notice\.error/);
  assert.match(app, /watchlistPending/);
  assert.match(app, /aria-busy="true"/);
  assert.match(app, /이미 관심종목에 저장된 종목입니다/);
  assert.match(app, /watchlistError/);
  assert.match(app, /class="inline-error" role="alert"/);
  assert.match(app, /오류 ID/);
  assert.match(app, /data-stream-connection/);
  assert.match(app, /연결 복구 중/);
  assert.match(app, /renderStreamConnectionBadge/);
  assert.match(app, /function markStreamDegraded/);
  assert.match(app, /dataStatus: "STALE"/);
  assert.match(app, /source\.onerror = \(\) => \{ state\.stream\.status = "reconnecting"; markStreamDegraded\(\)/);
  assert.match(app, /function setStreamBanner\(message, type = ""\) \{\n  renderStreamConnectionBadge\(\);/);
});

test("styles include visible focus, reduced motion, mobile reflow, and touch target rules", async () => {
  const css = await asset("styles.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /\.nav-link[^\n]*min-height: 46px/);
  assert.match(css, /\.bottom-nav/);
  assert.match(css, /touch-action|position:\s*sticky/);
});

test("evidence desk views expose market pulse, movers, and evidence-led stock structure", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /class="market-pulse"/);
  assert.match(app, /class="breadth-meter"/);
  assert.match(app, /class="movers-board"/);
  assert.match(app, /class="quote-lead"/);
  assert.match(app, /class="chart-with-table"/);
  assert.match(app, /class="[^"]*\bevidence-grid\b[^"]*"/);
  assert.match(css, /--canvas: #080d12/);
  assert.match(css, /\.market-pulse/);
  assert.match(css, /\.quote-lead/);
  assert.match(css, /\.chart-with-table/);
});

test("evidence desk labels data status beside the decision context", async () => {
  const app = await asset("app.js");
  assert.match(app, /시장 판독/);
  assert.match(app, /시장 폭/);
  assert.match(app, /근거 읽기/);
  assert.match(app, /가격 흐름과 동일한 데이터/);
  assert.match(app, /기준 시각/);
  assert.match(app, /플랫폼 수신/);
});

test("research desk exposes a cohesive dark command workspace without changing evidence semantics", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /class="research-shell"/);
  assert.match(app, /class="topbar-context"/);
  assert.match(css, /--canvas: #080d12/);
  assert.match(css, /--interaction: #a69bff/);
  assert.match(css, /\.sidebar/);
  assert.doesNotMatch(app, /class="workspace-command"/);
});

test("desktop sidebar gives each navigation item a full-width, touch-sized target", async () => {
  const css = await asset("styles.css");
  assert.match(css, /\.nav-list, \.bottom-nav ul \{[^}]*gap: 6px/);
  assert.match(css, /\.nav-link \{[^}]*display: flex/);
  assert.match(css, /\.nav-link \{[^}]*min-height: 46px/);
  assert.match(css, /\.sidebar-brand/);
});

test("destructive actions use an accessible confirmation sheet instead of a native blocking prompt", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /function confirmAction/);
  assert.match(app, /setAttribute\("role", "dialog"\)/);
  assert.match(app, /aria-modal/);
  assert.match(app, /previouslyFocused/);
  assert.match(app, /event\.key === "Escape"/);
  assert.doesNotMatch(app, /window\.confirm/);
  assert.match(css, /\.confirm-sheet/);
  assert.match(css, /background: rgb\(0 0 0 \/ 65%\)/);
});

test("stock search exposes a keyboard-selectable combobox and listbox", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /role="combobox"/);
  assert.match(app, /aria-autocomplete="list"/);
  assert.match(app, /role="listbox"/);
  assert.match(app, /role="option"/);
  assert.match(app, /event\.key === "ArrowDown"/);
  assert.match(app, /event\.key === "ArrowUp"/);
  assert.match(app, /event\.key === "Enter"/);
  assert.match(app, /aria-activedescendant/);
  assert.match(css, /\.search-result\[aria-selected="true"\]/);
  assert.match(app, /stock\.tradingStatus/);
  assert.match(app, /searchError/);
 assert.match(app, /retry-search/);
  assert.match(app, /aria-describedby=\\"search-error/);
  assert.match(app, /오류 ID/);
  assert.match(app, /마지막 정상 수신/);
  assert.match(app, /const resumeCursor = state\.stream\.lastCursor/);
  assert.match(app, /params\.set\("afterSequence", String\(resumeCursor\.sequence\)\)/);
  assert.match(app, /role="status" aria-live="polite"/);
});

test("structured screener keeps validation failures visible with a retry action", async () => {
  const app = await asset("app.js");
  assert.match(app, /screenerError/);
  assert.match(app, /retry-screener/);
 assert.match(app, /function retryableErrorMarkup/);
  assert.match(app, /screener-error/);
  assert.match(app, /setAttribute\("aria-describedby", "screener-error"\)/);
  assert.match(app, /role="alert"/);
});

test("subscription mutations keep provider failures visible and retryable", async () => {
  const app = await asset("app.js");
  assert.match(app, /subscriptionError/);
  assert.match(app, /retry-subscription/);
  assert.match(app, /state\.subscriptionError = \{ error: errorValue, action: "checkout" \}/);
 assert.match(app, /state\.subscriptionError = \{ error: errorValue, action: "cancel" \}/);
  assert.match(app, /aria-describedby="watchlist-error-/);
  assert.match(app, /provider 확인 필요/);
  assert.match(app, /<strong>SUSPENDED<\/strong> provider 재활성화 전까지 신호 권한이 중지된 상태/);
});
