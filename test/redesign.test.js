import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function asset(name) {
  return readFile(new URL(`../public/${name}`, import.meta.url), "utf8");
}

test("the research desk uses one dark visual system instead of the legacy paper canvas", async () => {
  const css = await asset("styles.css");
  assert.match(css, /--canvas:\s*#080d12/i);
  assert.match(css, /--surface-1:\s*#0f171f/i);
  assert.match(css, /--interaction:\s*#a69bff/i);
  assert.doesNotMatch(css, /--paper-50/);
  assert.doesNotMatch(css, /--canvas:\s*#f5f1e8/i);
});

test("the product shell does not expose prototype role switching or sandbox copy", async () => {
  const app = await asset("app.js");
  assert.match(app, /class="research-shell"/);
  assert.doesNotMatch(app, /class="role-switcher"/);
  assert.doesNotMatch(app, /data-role="/);
  assert.doesNotMatch(app, /sandbox 로그인/);
  assert.doesNotMatch(app, /sandbox 구독 시작/);
  assert.match(app, /로그인/);
});

test("the redesigned shell keeps the market rail and mobile task navigation", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /class="market-rail[^"]*"/);
  assert.match(app, /class="bottom-nav"/);
  assert.match(app, /class="sidebar"/);
  assert.ok(app.indexOf('<nav class="bottom-nav"') < app.indexOf('<main id="main-content"'), "mobile navigation must not overlay the main content");
  assert.match(css, /\.research-shell/);
  assert.match(css, /\.market-rail/);
  assert.match(css, /\.bottom-nav/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.bottom-nav \{[^}]*position:\s*sticky/);
});

test("the market and stock screens retain accessible evidence structure", async () => {
  const app = await asset("app.js");
  assert.match(app, /class="market-pulse"/);
  assert.match(app, /class="breadth-meter"/);
  assert.match(app, /class="movers-board"/);
  assert.match(app, /class="quote-lead"/);
  assert.match(app, /class="chart-with-table"/);
  assert.match(app, /aria-labelledby="chart-title chart-desc"/);
  assert.match(app, /동일한 데이터를/);
});

test("the desk defines shared spacing and styles every data-entry surface", async () => {
  const css = await asset("styles.css");
  assert.match(css, /--space-24:\s*24px/);
  assert.match(css, /\.main-inner\s*>\s*\*\s*\+\s*\*/);
  assert.match(css, /\.search-panel\s+input/);
  assert.match(css, /\.connection-banner/);
  assert.match(css, /\.flow-bar/);
});

test("mobile movers preserve rate and freshness instead of hiding columns", async () => {
  const css = await asset("styles.css");
  assert.doesNotMatch(css, /\.movers-board[^{}]*nth-child\(n \+ 4\)/);
  assert.doesNotMatch(css, /\.movers-board[^{}]*nth-child\(n\+4\)/);
  assert.match(css, /\.movers-board \.table-wrap\s*table\s*\{[^}]*min-width:\s*100%/s);
});

test("market readings expose the directional bias as a semantic value", async () => {
  const app = await asset("app.js");
  assert.match(app, /class="pulse-bias[^\"]*\$\{changeClass\(leadIndex\?\.change\)\}/);
});

test("permission gates distinguish login-required from subscription-required work", async () => {
  const app = await asset("app.js");
  assert.match(app, /function lockedSignal\(ticker, name, access = "subscription"\)/);
  assert.match(app, /lockedSignal\("", "조건 스크리너", "login"\)/);
  assert.match(app, /lockedSignal\("", "관심종목", "login"\)/);
  assert.match(app, /lockedSignal\("", "구독·계정", "login"\)/);
});

test("the desktop rail owns a persistent viewport and its own navigation scroll region", async () => {
  const app = await asset("app.js");
  const css = await asset("styles.css");
  assert.match(app, /class="sidebar-scroll"/);
  assert.match(app, /class="sidebar-footer"/);
  assert.match(css, /\.sidebar\s*\{[^}]*position:\s*fixed;[^}]*height:\s*100dvh/);
  assert.match(css, /\.sidebar-scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /\.research-shell\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns/);
});

test("stock detail uses one evidence-led render path without the legacy duplicate header", async () => {
  const app = await asset("app.js");
  assert.doesNotMatch(app, /<div class="stock-header card card-flat">/);
  assert.match(app, /evidenceStockMarkup\(\{ stock, quote, chart, flows, news, financials, signal, ticker, watchlistAction, quoteView \}\)/);
});

test("terminal surfaces avoid decorative blur and gradient treatments", async () => {
  const css = await asset("styles.css");
  assert.doesNotMatch(css, /\.topbar\s*\{[^}]*backdrop-filter/);
  assert.doesNotMatch(css, /\.quote-lead\s*\{[^}]*linear-gradient/);
  assert.doesNotMatch(css, /\.signal-card\s*\{[^}]*linear-gradient/);
});

test("route changes preserve the shell and guard async responses against stale renders", async () => {
  const app = await asset("app.js");
  assert.match(app, /if \(!document\.querySelector\("\.research-shell"\)\) renderShell\(route\)/);
  assert.match(app, /function syncShell\(route\)/);
  assert.match(app, /function navIsActive\(route, name\)/);
  assert.match(app, /name === "market" && route\.name === "stock"/);
  assert.match(app, /const renderId = \+\+renderSequence/);
  assert.match(app, /if \(renderId !== renderSequence\) return/);
  assert.match(app, /<main id="main-content" class="main" tabindex="-1"/);
  assert.match(app, /main\.focus\(\{ preventScroll: true \}\)/);
});

test("live signal updates only mutate the active signal card", async () => {
  const app = await asset("app.js");
  assert.match(app, /const route = routeFromHash\(\);[\s\S]*if \(route\.name !== "signals" && route\.name !== "stock"\) return/);
  assert.match(app, /if \(state\.stream\.ticker && signal\.ticker && state\.stream\.ticker !== signal\.ticker\) return/);
});