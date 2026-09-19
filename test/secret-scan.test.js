import test from "node:test";
import assert from "node:assert/strict";
import { scanText } from "../scripts/secret-scan.js";

test("secret scan detects high-confidence token patterns without returning values", () => {
  const awsKey = ["AKIA", "1234567890ABCDEF"].join("");
  const findings = scanText(`safe\nAuthorization: Bearer ${"a".repeat(24)}\n${awsKey}`, "fixture.txt");
  assert.deepEqual(findings.map(({ file, line, rule }) => ({ file, line, rule })), [
    { file: "fixture.txt", line: 3, rule: "aws-access-key" },
    { file: "fixture.txt", line: 2, rule: "bearer-token" },
  ]);
  assert.doesNotMatch(JSON.stringify(findings), /AKIA|1234567890ABCDEF/);
});

test("secret scan ignores ordinary sandbox labels and documentation text", () => {
  assert.deepEqual(scanText("demo-webhook-secret\nprovider sandbox\nBearer token is never persisted"), []);
});
