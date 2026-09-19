import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".md", ".sql", ".txt", ".yml", ".yaml"]);
const SECRET_PATTERNS = Object.freeze([
  ["private-key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ["slack-token", /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/g],
]);

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function scanText(text, file = "<text>") {
  const findings = [];
  for (const [rule, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(String(text))) !== null) {
      findings.push({ file, line: lineNumber(String(text), match.index), rule });
      if (!pattern.global) break;
    }
  }
  return findings;
}

async function collectTextFiles(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const filename = join(current, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(root, filename, output);
    } else if (entry.isFile() && (TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase()) || entry.name === ".env" || entry.name.startsWith(".env."))) {
      output.push(filename);
    }
  }
  return output;
}

export async function scanRepository(rootDir) {
  const findings = [];
  for (const filename of await collectTextFiles(rootDir)) {
    const contents = await readFile(filename, "utf8");
    findings.push(...scanText(contents, relative(rootDir, filename)));
  }
  return findings;
}

async function main() {
  const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const findings = await scanRepository(rootDir);
  if (!findings.length) {
    console.log("Secret scan passed: no high-confidence secret patterns found.");
    return;
  }
  console.error("Secret scan failed. Review these locations without printing secret values:");
  for (const finding of findings) console.error(`- ${finding.file}:${finding.line} (${finding.rule})`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
