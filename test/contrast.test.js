import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

test("design color tokens meet the approved contrast thresholds", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const token = (name) => {
    const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing color token: ${name}`);
    return match[1];
  };
  const pairs = [
    ["text", "canvas", 4.5],
    ["muted", "surface-2", 4.5],
    ["interaction", "canvas", 4.5],
    ["live", "canvas", 4.5],
    ["rise", "canvas", 4.5],
    ["fall", "canvas", 4.5],
    ["warning", "canvas", 4.5],
    ["error", "canvas", 4.5],
  ];
  for (const [foreground, background, minimum] of pairs) {
    const ratio = contrastRatio(token(foreground), token(background));
    assert.ok(ratio >= minimum, `${foreground} on ${background} contrast ${ratio.toFixed(2)} < ${minimum}`);
  }
});
