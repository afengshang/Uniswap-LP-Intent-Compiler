import assert from "node:assert/strict";
import test from "node:test";

import { deriveExecutionMode, derivePreflightSummary } from "./preflight.js";

test("deriveExecutionMode prefers official hybrid when API key is ready", () => {
  const mode = deriveExecutionMode({
    officialSkillsReady: true,
    onchainosInstalled: true,
    walletReady: true,
    okxEnvReady: true,
    uniswapApiKeyReady: true
  });

  assert.equal(mode, "official-skills-hybrid");
});

test("derivePreflightSummary falls back cleanly when UNISWAP_API_KEY is missing", () => {
  const summary = derivePreflightSummary({
    officialSkillsReady: true,
    onchainosInstalled: true,
    walletReady: true,
    okxEnvReady: true,
    uniswapApiKeyReady: false
  });

  assert.equal(summary.executionMode, "fallback-onchainos");
  assert.equal(summary.ready, false);
  assert.ok(summary.remediation.some((line) => line.includes("UNISWAP_API_KEY")));
});
