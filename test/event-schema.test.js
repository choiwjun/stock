import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeSignal } from "../src/domain/fixtures.js";
import { validateSignalEvent } from "../src/application/validation.js";

test("signal event JSON Schema matches the runtime event contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../contracts/signal-event.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  for (const field of ["eventId", "streamKey", "epoch", "sequence", "ticker", "strategyKey", "direction", "status", "dataStatus", "occurredAt", "publishedAt", "evidence"]) assert.ok(schema.required.includes(field), `missing ${field}`);
  assert.deepEqual(schema.properties.direction.enum, ["BUY", "SELL", "NEUTRAL"]);
  assert.equal(schema.properties.strategyKey.const, "default");
  assert.equal(schema.properties.streamKey.pattern, "^signal:[0-9]{6}:default$");
  assert.equal(validateSignalEvent(makeSignal("005930")).ok, true);
});

test("signal evidence values stay JSON serializable at the runtime boundary", () => {
  const functionValue = makeSignal("005930");
  functionValue.evidence = [{ type: "TEST", label: "function", value: () => "not-json" }];
  assert.equal(validateSignalEvent(functionValue).ok, false);

  const circularValue = {};
  circularValue.self = circularValue;
  const circularEvent = makeSignal("005930");
  circularEvent.evidence = [{ type: "TEST", label: "circular", value: circularValue }];
  assert.equal(validateSignalEvent(circularEvent).ok, false);
});
