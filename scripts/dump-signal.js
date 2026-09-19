import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("function signalCard");
const end = source.indexOf("function signalHistoryMarkup");
console.log(source.slice(start, end));
