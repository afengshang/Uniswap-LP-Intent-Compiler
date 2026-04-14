import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { nearestUsableTick } = require("@uniswap/v3-sdk");
import { APPROVAL_BUFFER_BPS, BLUECHIP_SYMBOLS, CORRELATED_SYMBOL_GROUPS, NATIVE_OKB_SENTINEL, OFFICIAL_RANGE_WIDTHS, PLAN_CONFIRMATION_TOLERANCE, RECOMMENDED_FEE_TIER_BY_ARCHETYPE, STABLE_SYMBOLS, WOKB_ADDRESS, WRAPPED_SYMBOL_PREFIXES } from "./config.js";
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function average(values) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function normalizeSymbol(symbol) {
    const upper = symbol.toUpperCase();
    for (const prefix of WRAPPED_SYMBOL_PREFIXES) {
        if (upper.startsWith(prefix) && upper.length > prefix.length + 1) {
            return upper.slice(prefix.length);
        }
    }
    return upper;
}
function sameCorrelatedGroup(left, right) {
    const leftUpper = left.toUpperCase();
    const rightUpper = right.toUpperCase();
    return CORRELATED_SYMBOL_GROUPS.some((group) => group.includes(leftUpper) && group.includes(rightUpper));
}
function feeTierScore(poolFee, archetype) {
    const recommended = RECOMMENDED_FEE_TIER_BY_ARCHETYPE[archetype];
    if (poolFee === recommended) {
        return 1;
    }
    if ((recommended === 100 && poolFee === 500) || (recommended === 500 && poolFee === 3000)) {
        return 0.8;
    }
    if ((recommended === 3000 && poolFee === 500) || (recommended === 10000 && poolFee === 3000)) {
        return 0.65;
    }
    return 0.4;
}
function describeFeeTier(archetype, fee) {
    const recommended = RECOMMENDED_FEE_TIER_BY_ARCHETYPE[archetype];
    if (fee === recommended) {
        return `Matches official liquidity-planner fee guidance for ${archetype} pairs.`;
    }
    return `Live pool fee tier is ${fee / 10_000}% while official liquidity-planner guidance would usually start from ${recommended / 10_000}% for ${archetype} pairs.`;
}
function getSwapSourceForMode(mode) {
    return mode === "official-skills-hybrid" ? "uniswap-trading-api" : "onchainos-dex";
}
export function formatPairSymbol(token0, token1) {
    return `${token0.symbol}/${token1.symbol}`;
}
export function tokenIsStable(token) {
    return STABLE_SYMBOLS.has(token.symbol.toUpperCase()) || (token.priceUsd > 0.98 && token.priceUsd < 1.02);
}
export function tokenIsBluechip(token) {
    return BLUECHIP_SYMBOLS.has(token.symbol.toUpperCase());
}
export function calculateRealizedVolatility(closes) {
    if (closes.length < 3) {
        return 0;
    }
    const returns = [];
    for (let index = 1; index < closes.length; index += 1) {
        if (closes[index - 1] <= 0 || closes[index] <= 0) {
            continue;
        }
        returns.push(Math.log(closes[index] / closes[index - 1]));
    }
    if (returns.length === 0) {
        return 0;
    }
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length - 1, 1);
    return Math.sqrt(variance);
}
export function classifyPairArchetype(token0, token1) {
    const token0Stable = tokenIsStable(token0);
    const token1Stable = tokenIsStable(token1);
    const token0Bluechip = tokenIsBluechip(token0);
    const token1Bluechip = tokenIsBluechip(token1);
    const normalized0 = normalizeSymbol(token0.symbol);
    const normalized1 = normalizeSymbol(token1.symbol);
    if (token0Stable && token1Stable) {
        return {
            pairArchetype: "stable",
            reason: "Both legs behave like stable assets, so tight official liquidity-planner ranges apply."
        };
    }
    if (normalized0 === normalized1 ||
        sameCorrelatedGroup(token0.symbol, token1.symbol) ||
        ((token0Bluechip || token0Stable) &&
            (token1Bluechip || token1Stable) &&
            token0.priceUsd > 0 &&
            token1.priceUsd > 0 &&
            Math.max(token0.priceUsd, token1.priceUsd) / Math.min(token0.priceUsd, token1.priceUsd) <= 1.2)) {
        return {
            pairArchetype: "correlated",
            reason: "The pair behaves like correlated assets or wrapped variants, so mid-tight official ranges fit best."
        };
    }
    if ((token0Stable && token1Bluechip) || (token1Stable && token0Bluechip) || (token0Bluechip && token1Bluechip)) {
        return {
            pairArchetype: "major",
            reason: "This is a bluechip or bluechip/stable pair, so official major-pair ranges and 0.30% fee guidance are appropriate."
        };
    }
    return {
        pairArchetype: "volatile",
        reason: "Neither side maps cleanly to official stable/correlated/major categories, so the pair is treated as volatile."
    };
}
export function getRecommendedFeeTier(archetype) {
    return RECOMMENDED_FEE_TIER_BY_ARCHETYPE[archetype];
}
export function getFeeGuidance(archetype, liveFeeTier) {
    return describeFeeTier(archetype, liveFeeTier);
}
export function getOfficialRangeWidth(archetype, profile) {
    return OFFICIAL_RANGE_WIDTHS[archetype][profile];
}
export function scoreCandidate(pool, preference) {
    const dexLiquidityUsd = pool.officialAnalytics?.dexScreenerLiquidityUsd ?? 0;
    const dexVolumeUsd = pool.officialAnalytics?.dexScreenerVolume24hUsd ?? 0;
    const defillamaTvlUsd = pool.officialAnalytics?.defillamaTvlUsd ?? 0;
    const defillamaApyPct = pool.officialAnalytics?.defillamaApyPct ?? 0;
    const liquidityUniverseUsd = Math.max(pool.token0.liquidityUsd + pool.token1.liquidityUsd, dexLiquidityUsd, defillamaTvlUsd);
    const liquidityScore = clamp(Math.log10(liquidityUniverseUsd + 1) / 8, 0, 1);
    const recentActivityScore = clamp(pool.recentSwapCount / 20, 0, 1);
    const volumeScore = dexVolumeUsd > 0 ? clamp(Math.log10(dexVolumeUsd + 1) / 8, 0, 1) : recentActivityScore;
    const feeScore = feeTierScore(pool.fee, pool.pairArchetype);
    const apyScore = defillamaApyPct > 0 ? clamp(defillamaApyPct / 30, 0, 1) : 0;
    const volatilityPenalty = clamp(pool.pairArchetype === "stable"
        ? pool.volatility24h / 0.01
        : pool.pairArchetype === "correlated"
            ? pool.volatility24h / 0.03
            : pool.pairArchetype === "major"
                ? pool.volatility24h / 0.08
                : pool.volatility24h / 0.14, 0, 1);
    const priceShockPenalty = clamp((Math.abs(pool.token0.change24hPct) + Math.abs(pool.token1.change24hPct)) /
        (pool.pairArchetype === "stable" ? 8 : pool.pairArchetype === "correlated" ? 18 : 40), 0, 1);
    const recognitionPenalty = (pool.token0.communityRecognized ? 0 : 0.2) + (pool.token1.communityRecognized ? 0 : 0.2);
    const inactivityPenalty = pool.recentSwapCount === 0 ? 0.25 : pool.recentSwapCount < 3 ? 0.12 : 0;
    const thinLiquidityPenalty = liquidityUniverseUsd < 100_000 ? 0.2 : liquidityUniverseUsd < 1_000_000 ? 0.08 : 0;
    const feeMismatchPenalty = pool.fee === pool.recommendedFeeTier ? 0 : 0.06;
    const stableBonus = pool.pairArchetype === "stable" ? 0.15 : 0;
    const correlatedBonus = pool.pairArchetype === "correlated" ? 0.08 : 0;
    const majorBonus = pool.pairArchetype === "major" ? 0.1 : 0;
    const preferenceBonus = preference === "stable" && pool.pairArchetype === "stable"
        ? 0.08
        : preference === "bluechip" && (pool.pairArchetype === "major" || pool.bluechipPair)
            ? 0.06
            : 0;
    const yieldScore = Math.round(100 * clamp(0.3 * recentActivityScore + 0.25 * volumeScore + 0.2 * feeScore + 0.15 * liquidityScore + 0.1 * apyScore, 0, 1));
    const riskScore = Math.round(100 *
        clamp(0.4 * volatilityPenalty +
            0.2 * priceShockPenalty +
            recognitionPenalty +
            inactivityPenalty +
            thinLiquidityPenalty +
            feeMismatchPenalty -
            stableBonus -
            correlatedBonus, 0, 1));
    const overallScore = Math.round(clamp(yieldScore - riskScore * 0.5 + 100 * (stableBonus + correlatedBonus + majorBonus + preferenceBonus), 0, 100));
    const warnings = [];
    const reasoning = [];
    if (!pool.token0.communityRecognized || !pool.token1.communityRecognized) {
        warnings.push("Contains at least one token without OKX community recognition.");
    }
    if (pool.recentSwapCount === 0) {
        warnings.push("No recent swap activity detected in the sampled X Layer block window.");
    }
    if (pool.officialAnalytics?.warnings.length) {
        warnings.push(...pool.officialAnalytics.warnings);
    }
    if (pool.fee !== pool.recommendedFeeTier) {
        warnings.push(pool.feeGuidance);
    }
    if (pool.volatility24h > (pool.pairArchetype === "volatile" ? 0.1 : 0.04)) {
        warnings.push("Recent hourly candles imply elevated volatility for concentrated liquidity.");
    }
    reasoning.push(pool.pairArchetypeReason);
    reasoning.push(pool.feeGuidance);
    if (pool.recentSwapCount > 5) {
        reasoning.push("Recent swap activity suggests viable fee generation.");
    }
    if (dexVolumeUsd > 0) {
        reasoning.push(`DexScreener 24h volume proxy: $${Math.round(dexVolumeUsd).toLocaleString()}.`);
    }
    if (defillamaApyPct > 0) {
        reasoning.push(`DefiLlama APY proxy: ${defillamaApyPct.toFixed(2)}%.`);
    }
    return {
        ...pool,
        yieldScore,
        riskScore,
        overallScore,
        warnings,
        reasoning
    };
}
export function priceToTick(priceToken1PerToken0, token0Decimals, token1Decimals) {
    const decimalAdjusted = priceToken1PerToken0 / 10 ** (token0Decimals - token1Decimals);
    return Math.floor(Math.log(decimalAdjusted) / Math.log(1.0001));
}
export function priceFromSqrtRatioX96(sqrtPriceX96, token0Decimals, token1Decimals) {
    const ratio = Number(sqrtPriceX96) / 2 ** 96;
    return ratio * ratio * 10 ** (token0Decimals - token1Decimals);
}
export function deriveRangePlan(pool, profile) {
    const width = getOfficialRangeWidth(pool.pairArchetype, profile);
    const lowerPrice = pool.currentPriceToken1PerToken0 * (1 - width);
    const upperPrice = pool.currentPriceToken1PerToken0 * (1 + width);
    const lowerTick = nearestUsableTick(priceToTick(lowerPrice, pool.token0.decimals, pool.token1.decimals), pool.tickSpacing);
    const upperTick = nearestUsableTick(priceToTick(upperPrice, pool.token0.decimals, pool.token1.decimals), pool.tickSpacing);
    const safeLowerTick = Math.min(lowerTick, pool.currentTick - pool.tickSpacing);
    const safeUpperTick = Math.max(upperTick, pool.currentTick + pool.tickSpacing);
    return {
        profile,
        archetype: pool.pairArchetype,
        priceWidthPct: width,
        lowerTick: safeLowerTick,
        upperTick: safeUpperTick,
        lowerPrice,
        upperPrice,
        source: `Official liquidity-planner ${pool.pairArchetype} range guidance snapped to live Uniswap v3 ticks on X Layer.`
    };
}
function tokenAddressEquals(left, right) {
    return left.toLowerCase() === right.toLowerCase();
}
function toHumanAmount(amount, decimals) {
    return Number(amount) / 10 ** decimals;
}
function toRawAmount(amountHuman, decimals) {
    return BigInt(Math.floor(amountHuman * 10 ** decimals));
}
export function withApprovalBuffer(amount) {
    return (amount * BigInt(10_000 + APPROVAL_BUFFER_BPS)) / 10000n;
}
export function buildFundingPlan(pool, inventory, targetAmount0, targetAmount1, swapPlanningMode) {
    const actions = [];
    const warnings = [];
    const swapSource = getSwapSourceForMode(swapPlanningMode);
    let nativeRemaining = inventory.nativeOkb;
    let token0Available = inventory.token0Balance;
    let token1Available = inventory.token1Balance;
    const token0IsWokb = tokenAddressEquals(pool.token0.address, WOKB_ADDRESS);
    const token1IsWokb = tokenAddressEquals(pool.token1.address, WOKB_ADDRESS);
    const target0Human = toHumanAmount(targetAmount0, pool.token0.decimals);
    const target1Human = toHumanAmount(targetAmount1, pool.token1.decimals);
    const totalTargetUsd = target0Human * pool.token0.priceUsd + target1Human * pool.token1.priceUsd;
    if (token1IsWokb && token1Available < targetAmount1 && nativeRemaining > 0n) {
        const wrapAmount = nativeRemaining > targetAmount1 - token1Available ? targetAmount1 - token1Available : nativeRemaining;
        if (wrapAmount > 0n) {
            actions.push({
                kind: "wrap",
                token: pool.token1.address,
                amount: wrapAmount,
                amountHuman: toHumanAmount(wrapAmount, pool.token1.decimals),
                reason: "Top up WOKB inventory from native OKB before LP construction."
            });
            nativeRemaining -= wrapAmount;
            token1Available += wrapAmount;
        }
    }
    if (token0IsWokb && token0Available < targetAmount0 && nativeRemaining > 0n) {
        const wrapAmount = nativeRemaining > targetAmount0 - token0Available ? targetAmount0 - token0Available : nativeRemaining;
        if (wrapAmount > 0n) {
            actions.push({
                kind: "wrap",
                token: pool.token0.address,
                amount: wrapAmount,
                amountHuman: toHumanAmount(wrapAmount, pool.token0.decimals),
                reason: "Top up WOKB inventory from native OKB before LP construction."
            });
            nativeRemaining -= wrapAmount;
            token0Available += wrapAmount;
        }
    }
    const deficit0Usd = Math.max((target0Human - toHumanAmount(token0Available, pool.token0.decimals)) * pool.token0.priceUsd, 0);
    const deficit1Usd = Math.max((target1Human - toHumanAmount(token1Available, pool.token1.decimals)) * pool.token1.priceUsd, 0);
    if (deficit1Usd > PLAN_CONFIRMATION_TOLERANCE * totalTargetUsd) {
        if (nativeRemaining > 0n) {
            const nativeToSwapHuman = deficit1Usd / Math.max(pool.token0.priceUsd, 0.000001);
            actions.push({
                kind: "swap",
                fromToken: NATIVE_OKB_SENTINEL,
                toToken: pool.token1.address,
                amountIn: toRawAmount(nativeToSwapHuman, 18),
                amountInHuman: nativeToSwapHuman,
                reason: "Use native OKB to acquire the missing non-WOKB LP leg.",
                preferredSource: swapSource,
                planningMode: swapPlanningMode,
                fallbackAvailable: swapPlanningMode === "official-skills-hybrid"
            });
            nativeRemaining = 0n;
        }
        else if (token0Available > targetAmount0) {
            const excess0Human = toHumanAmount(token0Available - targetAmount0, pool.token0.decimals);
            const desiredSourceHuman = Math.min(excess0Human, (deficit1Usd / Math.max(pool.token0.priceUsd, 0.000001)) * 1.02);
            if (desiredSourceHuman > 0) {
                actions.push({
                    kind: "swap",
                    fromToken: pool.token0.address,
                    toToken: pool.token1.address,
                    amountIn: toRawAmount(desiredSourceHuman, pool.token0.decimals),
                    amountInHuman: desiredSourceHuman,
                    reason: "Shift excess token0 inventory into the missing token1 LP leg.",
                    preferredSource: swapSource,
                    planningMode: swapPlanningMode,
                    fallbackAvailable: swapPlanningMode === "official-skills-hybrid"
                });
            }
        }
    }
    if (deficit0Usd > PLAN_CONFIRMATION_TOLERANCE * totalTargetUsd) {
        if (nativeRemaining > 0n && token0IsWokb) {
            const wrapAmount = nativeRemaining > targetAmount0 - token0Available ? targetAmount0 - token0Available : nativeRemaining;
            if (wrapAmount > 0n) {
                actions.push({
                    kind: "wrap",
                    token: pool.token0.address,
                    amount: wrapAmount,
                    amountHuman: toHumanAmount(wrapAmount, pool.token0.decimals),
                    reason: "Use native OKB to complete the WOKB side."
                });
                nativeRemaining -= wrapAmount;
            }
        }
        else if (token1Available > targetAmount1) {
            const excess1Human = toHumanAmount(token1Available - targetAmount1, pool.token1.decimals);
            const desiredSourceHuman = Math.min(excess1Human, (deficit0Usd / Math.max(pool.token1.priceUsd, 0.000001)) * 1.02);
            if (desiredSourceHuman > 0) {
                actions.push({
                    kind: "swap",
                    fromToken: pool.token1.address,
                    toToken: pool.token0.address,
                    amountIn: toRawAmount(desiredSourceHuman, pool.token1.decimals),
                    amountInHuman: desiredSourceHuman,
                    reason: "Shift excess token1 inventory into the missing token0 LP leg.",
                    preferredSource: swapSource,
                    planningMode: swapPlanningMode,
                    fallbackAvailable: swapPlanningMode === "official-skills-hybrid"
                });
            }
        }
    }
    const finalToken0Human = toHumanAmount(token0Available, pool.token0.decimals);
    const finalToken1Human = toHumanAmount(token1Available, pool.token1.decimals);
    const closeness = average([
        target0Human === 0 ? 1 : Math.min(finalToken0Human / target0Human, 1),
        target1Human === 0 ? 1 : Math.min(finalToken1Human / target1Human, 1)
    ]);
    if (closeness > 0.94 && actions.every((action) => action.kind !== "swap")) {
        warnings.push("Wallet inventory is already close to the target LP mix, so pre-swap can be skipped.");
    }
    const feasible = actions.length > 0 || (token0Available >= targetAmount0 && token1Available >= targetAmount1);
    if (!feasible) {
        warnings.push("The wallet does not currently hold enough compatible inventory for this LP without external funding.");
    }
    return { actions, warnings, feasible, swapPlanningMode };
}
export function classifyRangeStatus(currentTick, lowerTick, upperTick) {
    if (currentTick < lowerTick || currentTick > upperTick) {
        return "out_of_range";
    }
    const width = upperTick - lowerTick;
    const margin = Math.max(Math.floor(width * 0.1), 1);
    if (currentTick - lowerTick <= margin || upperTick - currentTick <= margin) {
        return "near_edge";
    }
    return "in_range";
}
