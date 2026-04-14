import assert from "node:assert/strict";
import { NATIVE_OKB_SENTINEL } from "./config.js";
import { buildFundingPlan, classifyRangeStatus, deriveRangePlan, scoreCandidate } from "./strategy.js";
import { parseIntent } from "./intent.js";
import { CAPABILITY_PROMPTS, derivePreflightSummary } from "./preflight.js";
import { buildTradingApprovalRequest, buildTradingQuoteRequest, prepareTradingSwapRequest } from "./uniswap.js";
const wokb = {
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
const usdc = {
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
const samplePool = {
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
function main() {
    const parsed = parseIntent("Open a conservative WOKB/USDC LP on X Layer with $250");
    assert.equal(parsed.pairHint, "WOKB/USDC");
    assert.equal(parsed.depositUsd, 250);
    assert.equal(parsed.riskProfile, "conservative");
    const defaultIntent = parseIntent("Find LP ideas on X Layer");
    assert.equal(defaultIntent.depositUsd, 100);
    assert.equal(defaultIntent.riskProfile, "balanced");
    const range = deriveRangePlan(samplePool, "balanced");
    assert.ok(range.lowerTick < samplePool.currentTick);
    assert.ok(range.upperTick > samplePool.currentTick);
    assert.equal(range.archetype, "major");
    const funding = buildFundingPlan(samplePool, {
        walletAddress: "0x1111111111111111111111111111111111111111",
        nativeOkb: 10n * 10n ** 18n,
        token0Balance: 0n,
        token1Balance: 0n,
        token0BalanceHuman: 0,
        token1BalanceHuman: 0
    }, 1n * 10n ** 18n, 40n * 10n ** 6n, "official-skills-hybrid");
    assert.ok(funding.actions.length > 0);
    assert.equal(funding.feasible, true);
    assert.equal(funding.swapPlanningMode, "official-skills-hybrid");
    assert.equal(classifyRangeStatus(105, 100, 200), "near_edge");
    assert.equal(classifyRangeStatus(250, 100, 200), "out_of_range");
    const scored = scoreCandidate(samplePool, "bluechip");
    assert.ok(scored.overallScore > 0);
    assert.ok(scored.reasoning.length > 0);
    const approvalRequest = buildTradingApprovalRequest({
        walletAddress: "0x1111111111111111111111111111111111111111",
        token: NATIVE_OKB_SENTINEL,
        amount: 123n
    });
    assert.equal(approvalRequest.token, "0x0000000000000000000000000000000000000000");
    const quoteRequest = buildTradingQuoteRequest({
        walletAddress: "0x1111111111111111111111111111111111111111",
        fromToken: samplePool.token0.address,
        toToken: samplePool.token1.address,
        amountIn: 1000n
    });
    assert.equal(quoteRequest.tokenInChainId, "196");
    const swapRequest = prepareTradingSwapRequest({
        routing: "CLASSIC",
        permitData: null,
        permitTransaction: null,
        quote: {
            output: {
                amount: "123"
            }
        }
    });
    assert.ok(!("permitData" in swapRequest));
    const preflightSummary = derivePreflightSummary({
        officialSkillsReady: true,
        onchainosInstalled: true,
        walletReady: true,
        okxEnvReady: true,
        uniswapApiKeyReady: false
    });
    assert.equal(preflightSummary.executionMode, "fallback-onchainos");
    assert.equal(preflightSummary.ready, false);
    assert.ok(CAPABILITY_PROMPTS.some((prompt) => prompt.id === "close-lp"));
    console.log(JSON.stringify({
        ok: true,
        checks: 12
    }));
}
main();
