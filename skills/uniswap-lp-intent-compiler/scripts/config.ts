import { defineChain } from "viem";

import type { PairArchetype, RiskProfile } from "./types.js";

export const XLAYER_CHAIN_ID = 196;

export const xlLayerChain = defineChain({
  id: XLAYER_CHAIN_ID,
  name: "X Layer",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech"]
    }
  },
  blockExplorers: {
    default: {
      name: "OKX Explorer",
      url: "https://web3.okx.com/explorer/x-layer"
    }
  }
});

export const UNISWAP_V3_FACTORY = "0xcb2436774c3e191c85056d248ef4260ce5f27a9d" as const;
export const UNISWAP_V3_POSITION_MANAGER = "0x743e03cceb4af2efa3cc76838f6e8b50b63f184c" as const;
export const UNISWAP_V3_QUOTER_V2 = "0x5911cb3633e764939edc2d92b7e1ad375bb57649" as const;
export const WOKB_ADDRESS = "0xe538905cf8410324e03a5a23c1c177a474d59b2b" as const;
export const NATIVE_OKB_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
export const UNISWAP_NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const FACTORY_DISCOVERY_FROM_BLOCK = 0n;
export const SWAP_ACTIVITY_LOOKBACK_BLOCKS = 1_200n;
export const DEFAULT_PLAN_CANDIDATE_LIMIT = 5;
export const PLAN_CONFIRMATION_TOLERANCE = 0.05;
export const SLIPPAGE_BPS = 50;
export const APPROVAL_BUFFER_BPS = 300;
export const DEADLINE_SECONDS = 60 * 30;

export const TICK_SPACING_BY_FEE: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200
};

export const OFFICIAL_RANGE_WIDTHS: Record<PairArchetype, Record<RiskProfile, number>> = {
  stable: {
    conservative: 0.02,
    balanced: 0.01,
    aggressive: 0.005
  },
  correlated: {
    conservative: 0.05,
    balanced: 0.03,
    aggressive: 0.02
  },
  major: {
    conservative: 0.2,
    balanced: 0.1,
    aggressive: 0.05
  },
  volatile: {
    conservative: 0.5,
    balanced: 0.3,
    aggressive: 0.15
  }
};

export const RECOMMENDED_FEE_TIER_BY_ARCHETYPE: Record<PairArchetype, number> = {
  stable: 100,
  correlated: 500,
  major: 3000,
  volatile: 10000
};

export const BLUECHIP_SYMBOLS = new Set(["WETH", "WOKB", "WBTC", "ETH", "OKB", "BTC"]);
export const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDE", "USD0"]);
export const WRAPPED_SYMBOL_PREFIXES = ["W"];
export const CORRELATED_SYMBOL_GROUPS = [
  ["ETH", "WETH", "STETH", "WSTETH", "EZETH", "WEETH"],
  ["BTC", "WBTC", "TBTC"],
  ["OKB", "WOKB"]
] as const;

export const BASE_ANALYTICS_SOURCES = [
  "Official Uniswap liquidity-planner pair and range conventions",
  "OnchainOS token search and market candles",
  "Live Uniswap v3 pool reads on X Layer"
] as const;

export const DISCOVERY_SYMBOL_QUERIES = ["WOKB", "USDC", "USDT", "XLAYER_USDT", "WETH", "WBTC"] as const;
