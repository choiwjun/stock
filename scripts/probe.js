import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
for (const key of ['"eyebrow"', "grid-4", "grid-3", "status-dot", "metric-card", "index-card", "grid grid-2", "market-mover", "quote-summary", "card-subtle", "signal-lock-icon", "chart-subtitle", "history-revisions"]) {
  console.log(key, "app:", app.split(key).length - 1);
}
console.log("--- css ---");
for (const sel of [".grid-2", ".grid-3", ".grid-4", ".metric-card", ".eyebrow", ".status-dot", ".quote-summary", ".card-subtle", ".market-mover", ".index-card"]) {
  const i = css.lastIndexOf(sel);
  console.log(sel, "->", i === -1 ? "none" : JSON.stringify(css.slice(i, css.indexOf("}", i) + 1)));
}
