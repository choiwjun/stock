import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

// app.js에서 사용하는 정적 class 추출
const used = new Set();
for (const match of app.matchAll(/class="([^"]*)"/g)) {
  for (const token of match[1].split(/\s+/)) {
    if (token && !token.includes("$") && !token.includes("{") && !/^[0-9>=?]/.test(token)) used.add(token);
  }
}
const missing = [...used].filter((name) => !css.includes(`.${name}`));
console.log("missing selectors:", missing.length ? missing : "none");
