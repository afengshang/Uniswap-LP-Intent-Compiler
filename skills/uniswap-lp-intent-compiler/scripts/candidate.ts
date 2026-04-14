import { createPublicClient, getAddress, http, isAddress, parseAbiItem } from "viem";

import { swapEvent, uniswapV3PoolAbi } from "./abis.js";
import {
  BASE_ANALYTICS_SOURCES,
  DEFAULT_PLAN_CANDIDATE_LIMIT,
  DISCOVERY_SYMBOL_QUERIES,
  SWAP_ACTIVITY_LOOKBACK_BLOCKS,
  TICK_SPACING_BY_FEE,
  UNISWAP_V3_FACTORY,
  WOKB_ADDRESS,
  xlLayerChain
} from "./config.js";
import { parseIntent } from "./intent.js";
import { getMarketKlines, searchTokenByAddress, searchTokenQuery } from "./onchainos.js";
import {
  calculateRealizedVolatility,
  classifyPairArchetype,
  getFeeGuidance,
  getRecommendedFeeTier,
  formatPairSymbol,
  priceFromSqrtRatioX96,
  scoreCandidate,
  tokenIsBluechip,
  tokenIsStable
} from "./strategy.js";
import type { CandidatePool, LPIntent, OfficialAnalyticsSnapshot, PoolState, TokenMetadata } from "./types.js";
import { fetchOfficialPoolAnalytics } from "./uniswap.js";

const publicClient = createPublicClient({
  chain: xlLayerChain,
  transport: http(xlLayerChain.rpcUrls.default.http[0])
});

const tokenCache = new Map<string, Promise<TokenMetadata>>();
const klineCache = new Map<string, Promise<number>>();
const activityCache = new Map<string, Promise<number>>();
const universeCache = new Map<string, Promise<TokenMetadata[]>>();
const analyticsCache = new Map<string, Promise<OfficialAnalyticsSnapshot>>();
const LOG_SCAN_CHUNK_SIZE = 100n;
const ACTIVITY_SATURATION_COUNT = 24;

function normalisePairHint(pairHint?: string): string | undefined {
  if (!pairHint) {
    return undefined;
  }
  const [left, right] = pairHint.split("/");
  return [left.toUpperCase(), right.toUpperCase()].sort().join("/");
}

async function getTokenMetadata(address: `0x${string}`): Promise<TokenMetadata> {
  const key = address.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const item = await searchTokenByAddress(address);
    return {
      address: getAddress(item.tokenContractAddress.toLowerCase()) as `0x${string}`,
      symbol: item.tokenSymbol,
      name: item.tokenName,
      decimals: Number(item.decimal),
      priceUsd: Number(item.price),
      change24hPct: Number(item.change),
      liquidityUsd: Number(item.liquidity),
      holders: Number(item.holders || "0"),
      communityRecognized: Boolean(item.tagList?.communityRecognized)
    };
  })();

  tokenCache.set(key, promise);
  return promise;
}

async function getTokenVolatility(address: `0x${string}`): Promise<number> {
  const key = address.toLowerCase();
  const cached = klineCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const candles = await getMarketKlines(address, 24);
    const closes = candles
      .slice()
      .reverse()
      .map((item) => Number(item.c))
      .filter((value) => Number.isFinite(value) && value > 0);
    return calculateRealizedVolatility(closes);
  })();
  klineCache.set(key, promise);
  return promise;
}

async function getRecentSwapCount(poolAddress: `0x${string}`): Promise<number> {
  const key = poolAddress.toLowerCase();
  const cached = activityCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > SWAP_ACTIVITY_LOOKBACK_BLOCKS ? latestBlock - SWAP_ACTIVITY_LOOKBACK_BLOCKS : 0n;
    let total = 0;

    for (let start = fromBlock; start <= latestBlock; start += LOG_SCAN_CHUNK_SIZE) {
      const end = start + LOG_SCAN_CHUNK_SIZE - 1n > latestBlock ? latestBlock : start + LOG_SCAN_CHUNK_SIZE - 1n;
      const logs = await publicClient.getLogs({
        address: poolAddress,
        event: swapEvent,
        fromBlock: start,
        toBlock: end
      });
      total += logs.length;
      if (total >= ACTIVITY_SATURATION_COUNT) {
        return total;
      }
    }

    return total;
  })();
  activityCache.set(key, promise);
  return promise;
}

async function getDiscoveryUniverse(intent: LPIntent): Promise<TokenMetadata[]> {
  const pairSymbols = intent.pairHint?.split("/").map((symbol) => symbol.trim().toUpperCase()) ?? [];
  const queryKey = [...DISCOVERY_SYMBOL_QUERIES, ...pairSymbols].sort().join("|");
  const cached = universeCache.get(queryKey);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const queryResults = [];
    for (const query of [...new Set([...DISCOVERY_SYMBOL_QUERIES, ...pairSymbols])]) {
      queryResults.push(await searchTokenQuery(query));
    }
    const deduped = new Map<string, TokenMetadata>();

    for (const resultSet of queryResults) {
      for (const item of resultSet) {
        if (!isAddress(item.tokenContractAddress) || item.tokenContractAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
          continue;
        }
        const address = getAddress(item.tokenContractAddress.toLowerCase()) as `0x${string}`;
        if (deduped.has(address.toLowerCase())) {
          continue;
        }
        const token: TokenMetadata = {
          address,
          symbol: item.tokenSymbol,
          name: item.tokenName,
          decimals: Number(item.decimal),
          priceUsd: Number(item.price),
          change24hPct: Number(item.change),
          liquidityUsd: Number(item.liquidity),
          holders: Number(item.holders || "0"),
          communityRecognized: Boolean(item.tagList?.communityRecognized)
        };
        if (token.communityRecognized || token.address.toLowerCase() === WOKB_ADDRESS.toLowerCase()) {
          deduped.set(address.toLowerCase(), token);
        }
      }
    }

    return [...deduped.values()];
  })();

  universeCache.set(queryKey, promise);
  return promise;
}

async function getOfficialAnalytics(poolAddress: `0x${string}`, token0: TokenMetadata, token1: TokenMetadata) {
  const key = `${poolAddress.toLowerCase()}:${token0.address.toLowerCase()}:${token1.address.toLowerCase()}`;
  const cached = analyticsCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = fetchOfficialPoolAnalytics({
    poolAddress,
    token0,
    token1
  });
  analyticsCache.set(key, promise);
  return promise;
}

async function buildPoolState(poolAddress: `0x${string}`): Promise<PoolState | null> {
  const [token0Address, token1Address, fee, liquidity, slot0, tickSpacing] = await Promise.all([
    publicClient.readContract({ address: poolAddress, abi: uniswapV3PoolAbi, functionName: "token0" }),
    publicClient.readContract({ address: poolAddress, abi: uniswapV3PoolAbi, functionName: "token1" }),
    publicClient.readContract({ address: poolAddress, abi: uniswapV3PoolAbi, functionName: "fee" }),
    publicClient.readContract({ address: poolAddress, abi: uniswapV3PoolAbi, functionName: "liquidity" }),
    publicClient.readContract({ address: poolAddress, abi: uniswapV3PoolAbi, functionName: "slot0" }),
    publicClient.readContract({ address: poolAddress, abi: uniswapV3PoolAbi, functionName: "tickSpacing" })
  ]);

  if (liquidity === 0n) {
    return null;
  }

  const token0 = await getTokenMetadata(token0Address as `0x${string}`);
  const token1 = await getTokenMetadata(token1Address as `0x${string}`);
  const [{ pairArchetype, reason }, officialAnalytics, volatility0, volatility1, recentSwapCount] = await Promise.all([
    Promise.resolve(classifyPairArchetype(token0, token1)),
    getOfficialAnalytics(poolAddress, token0, token1),
    getTokenVolatility(token0.address),
    getTokenVolatility(token1.address),
    getRecentSwapCount(poolAddress)
  ]);

  const recommendedFeeTier = getRecommendedFeeTier(pairArchetype);
  const analyticsSources = [...new Set([...BASE_ANALYTICS_SOURCES, ...officialAnalytics.sourceLabels])];

  return {
    address: poolAddress,
    token0,
    token1,
    fee: Number(fee),
    tickSpacing: Number(tickSpacing ?? TICK_SPACING_BY_FEE[Number(fee)] ?? 60),
    liquidity,
    sqrtPriceX96: slot0[0],
    currentTick: Number(slot0[1]),
    currentPriceToken1PerToken0: priceFromSqrtRatioX96(slot0[0], token0.decimals, token1.decimals),
    recentSwapCount,
    volatility24h: (volatility0 + volatility1) / 2,
    stablePair: tokenIsStable(token0) && tokenIsStable(token1),
    bluechipPair: tokenIsBluechip(token0) || tokenIsBluechip(token1),
    pairArchetype,
    pairArchetypeReason: reason,
    recommendedFeeTier,
    feeGuidance: getFeeGuidance(pairArchetype, Number(fee)),
    analyticsSources,
    officialAnalytics
  };
}

export async function discoverCandidatePools(intentInput: string | LPIntent): Promise<CandidatePool[]> {
  const intent = typeof intentInput === "string" ? parseIntent(intentInput) : intentInput;
  const tokens = await getDiscoveryUniverse(intent);
  const getPoolAbi = [parseAbiItem("function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)")];
  const feeTiers = [100, 500, 3000, 10000];
  const poolAddresses = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    for (let inner = index + 1; inner < tokens.length; inner += 1) {
      for (const fee of feeTiers) {
        const poolAddress = await publicClient.readContract({
          address: UNISWAP_V3_FACTORY,
          abi: getPoolAbi,
          functionName: "getPool",
          args: [tokens[index].address, tokens[inner].address, fee]
        });
        if (String(poolAddress) !== "0x0000000000000000000000000000000000000000") {
          poolAddresses.add(String(poolAddress).toLowerCase());
        }
      }
    }
  }

  const poolStates: PoolState[] = [];
  for (const address of poolAddresses) {
    try {
      const state = await buildPoolState(getAddress(address) as `0x${string}`);
      if (state) {
        poolStates.push(state);
      }
    } catch {
      continue;
    }
  }

  const ranked = poolStates
    .map((item) => scoreCandidate(item, intent.preference))
    .sort((left, right) => right.overallScore - left.overallScore);

  const pairHint = normalisePairHint(intent.pairHint);
  if (!pairHint && !intent.poolAddressHint) {
    return ranked.slice(0, DEFAULT_PLAN_CANDIDATE_LIMIT);
  }

  return ranked.filter((pool) => {
    if (intent.poolAddressHint && pool.address.toLowerCase() === intent.poolAddressHint.toLowerCase()) {
      return true;
    }
    return normalisePairHint(formatPairSymbol(pool.token0, pool.token1)) === pairHint;
  });
}

export async function getFullCandidateUniverse(): Promise<CandidatePool[]> {
  return discoverCandidatePools({
    ...parseIntent("Find LP ideas on X Layer"),
    pairHint: undefined,
    poolAddressHint: undefined
  });
}

export { publicClient };
