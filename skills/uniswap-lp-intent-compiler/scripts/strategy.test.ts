import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFundingPlan,
  classifyPairArchetype,
  classifyRangeStatus,
  deriveRangePlan,
  scoreCandidate
} from "./strategy.js";
import type { PoolState, TokenMetadata } from "./types.js";

const wokb: TokenMetadata = {
  address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
  symbol: "WOKB",
  name: "Wrapped OKB",
  decimals: 18,
  priceUsd: 85,
  change24hPct: 2,
  liquidityUsd: 1_000_000,
  holders: 10_000,
  communityRecognized: true
};

const usdc: TokenMetadata = {
  address: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  priceUsd: 1,
  change24hPct: 0.1,
  liquidityUsd: 1_500_000,
  holders: 30_000,
  communityRecognized: true
};

const pool: PoolState = {
  address: "0x87d7a0a51e27bf7232f97015ab3e53edc8104989",
  token0: wokb,
  token1: usdc,
  fee: 3000,
  tickSpacing: 60,
  liquidity: 1000n,
  sqrtPriceX96: 1n,
  currentTick: 100,
  currentPriceToken1PerToken0: 85,
  recentSwapCount: 10,
  volatility24h: 0.02,
  stablePair: false,
  bluechipPair: true,
  pairArchetype: "major",
  pairArchetypeReason: "Bluechip/stable pair.",
  recommendedFeeTier: 3000,
  feeGuidance: "Matches official liquidity-planner fee guidance for major pairs.",
  analyticsSources: ["Official Uniswap liquidity-planner pair and range conventions"]
};

test("deriveRangePlan returns a valid range around current tick", () => {
  const range = deriveRangePlan(pool, "balanced");
  assert.ok(range.lowerTick < pool.currentTick);
  assert.ok(range.upperTick > pool.currentTick);
  assert.equal(range.archetype, "major");
  assert.equal(range.priceWidthPct, 0.1);
});

test("buildFundingPlan uses native OKB for a WOKB pair", () => {
  const funding = buildFundingPlan(
    pool,
    {
      walletAddress: "0x1111111111111111111111111111111111111111",
      nativeOkb: 10n * 10n ** 18n,
      token0Balance: 0n,
      token1Balance: 0n,
      token0BalanceHuman: 0,
      token1BalanceHuman: 0
    },
    1n * 10n ** 18n,
    40n * 10n ** 6n,
    "official-skills-hybrid"
  );
  assert.ok(funding.actions.length > 0);
  assert.equal(funding.feasible, true);
});

test("classifyRangeStatus handles near-edge and out-of-range cases", () => {
  assert.equal(classifyRangeStatus(105, 100, 200), "near_edge");
  assert.equal(classifyRangeStatus(250, 100, 200), "out_of_range");
});

test("scoreCandidate gives active bluechip pools a positive score", () => {
  const scored = scoreCandidate(pool, "bluechip");
  assert.ok(scored.overallScore > 0);
  assert.ok(scored.reasoning.length > 0);
});

test("classifyPairArchetype identifies bluechip/stable pairs as major", () => {
  const classified = classifyPairArchetype(wokb, usdc);
  assert.equal(classified.pairArchetype, "major");
});
