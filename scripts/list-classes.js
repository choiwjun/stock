// 사용 중인 CSS class 수집 (스타일 재작업 검증용)
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const classes = new Set();
for (const match of source.matchAll(/class="([^"]*)"/g)) {
  for (const token of match[1].split(/\s+/)) {
    if (token && !token.includes("$") && !token.includes("{")) classes.add(token);
  }
}
console.log([...classes].sort().join("\n"));
