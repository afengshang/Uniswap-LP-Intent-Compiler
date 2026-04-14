export type RiskProfile = "conservative" | "balanced" | "aggressive";
export type IntentPreference = "stable" | "bluechip" | "balanced";
export type PairArchetype = "stable" | "correlated" | "major" | "volatile";
export type SwapPlanningMode = "official-skills-hybrid" | "fallback-onchainos";
export type SwapExecutionSource = "uniswap-trading-api" | "onchainos-dex" | "not-needed";

export interface TokenMetadata {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number;
  change24hPct: number;
  liquidityUsd: number;
  holders: number;
  communityRecognized: boolean;
}

export interface OfficialAnalyticsSnapshot {
  sourceLabels: string[];
  warnings: string[];
  dexScreenerLiquidityUsd?: number;
  dexScreenerVolume24hUsd?: number;
  dexScreenerUrl?: string;
  defillamaApyPct?: number;
  defillamaTvlUsd?: number;
  defillamaVolume24hUsd?: number;
}

export interface PoolState {
  address: `0x${string}`;
  token0: TokenMetadata;
  token1: TokenMetadata;
  fee: number;
  tickSpacing: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  currentTick: number;
  currentPriceToken1PerToken0: number;
  recentSwapCount: number;
  volatility24h: number;
  stablePair: boolean;
  bluechipPair: boolean;
  pairArchetype: PairArchetype;
  pairArchetypeReason: string;
  recommendedFeeTier: number;
  feeGuidance: string;
  analyticsSources: string[];
  officialAnalytics?: OfficialAnalyticsSnapshot;
}

export interface CandidatePool extends PoolState {
  yieldScore: number;
  riskScore: number;
  overallScore: number;
  warnings: string[];
  reasoning: string[];
}

export interface LPIntent {
  raw: string;
  chain: "xlayer";
  depositUsd: number;
  riskProfile: RiskProfile;
  pairHint?: string;
  poolAddressHint?: `0x${string}`;
  preference: IntentPreference;
}

export interface RangePlan {
  profile: RiskProfile;
  archetype: PairArchetype;
  priceWidthPct: number;
  lowerTick: number;
  upperTick: number;
  lowerPrice: number;
  upperPrice: number;
  source: string;
}

export interface InventorySnapshot {
  walletAddress: `0x${string}`;
  nativeOkb: bigint;
  token0Balance: bigint;
  token1Balance: bigint;
  token0BalanceHuman: number;
  token1BalanceHuman: number;
}

export type FundingAction =
  | {
      kind: "wrap";
      token: `0x${string}`;
      amount: bigint;
      amountHuman: number;
      reason: string;
    }
  | {
      kind: "swap";
      fromToken: `0x${string}`;
      toToken: `0x${string}`;
      amountIn: bigint;
      amountInHuman: number;
      reason: string;
      preferredSource: SwapExecutionSource;
      planningMode: SwapPlanningMode;
      fallbackAvailable: boolean;
    };

export interface FundingPlan {
  actions: FundingAction[];
  warnings: string[];
  feasible: boolean;
  swapPlanningMode: SwapPlanningMode;
}

export interface LPPlan {
  intent: LPIntent;
  selectedPool?: CandidatePool;
  candidates: CandidatePool[];
  suggestedPoolAddress?: `0x${string}`;
  range?: RangePlan;
  pairArchetype?: PairArchetype;
  targetAmount0?: bigint;
  targetAmount1?: bigint;
  targetAmount0Human?: number;
  targetAmount1Human?: number;
  fundingPlan?: FundingPlan;
  warnings: string[];
  officialSkillsUsed: string[];
  analyticsSources: string[];
  swapPlanningMode: SwapPlanningMode;
  prizeMode: boolean;
}

export interface ScanResult {
  action: "" | "warn" | "block";
  riskItemDetail: Array<{ name?: string; action?: string; description?: string | Record<string, string> }>;
  warnings: unknown;
  simulator?: {
    gasLimit?: string | null;
    gasUsed?: string | null;
    revertReason?: string | null;
  };
}

export interface ExecutionStepReceipt {
  kind: "wrap" | "approve" | "swap" | "mint" | "decrease_liquidity" | "collect" | "burn";
  target: string;
  txHash?: `0x${string}`;
  details?: Record<string, unknown>;
}

export interface ExecutionReceipt {
  walletAddress: `0x${string}`;
  poolAddress: `0x${string}`;
  approvals: ExecutionStepReceipt[];
  steps: ExecutionStepReceipt[];
  lpTxHash?: `0x${string}`;
  tokenId?: string;
  finalPlan: LPPlan;
  swapExecutionSource: SwapExecutionSource;
  officialSkillsUsed: string[];
  prizeMode: boolean;
  executionMode: SwapPlanningMode;
}

export interface PositionHealth {
  tokenId: string;
  poolAddress: `0x${string}`;
  pair: string;
  currentTick: number;
  lowerTick: number;
  upperTick: number;
  currentPriceToken1PerToken0: number;
  rangeStatus: "in_range" | "near_edge" | "out_of_range";
  feesOwed0: string;
  feesOwed1: string;
  recommendation: string;
}

export interface CloseLpPlan {
  tokenId: string;
  walletAddress: `0x${string}`;
  owner: `0x${string}`;
  poolAddress: `0x${string}`;
  pair: string;
  currentStatus: PositionHealth["rangeStatus"];
  currentTick: number;
  lowerTick: number;
  upperTick: number;
  liquidity: string;
  estimatedAmount0Min: string;
  estimatedAmount1Min: string;
  estimatedAmount0MinHuman: string;
  estimatedAmount1MinHuman: string;
  tokensOwed0: string;
  tokensOwed1: string;
  actions: Array<{
    kind: "decrease_liquidity" | "collect";
    target: `0x${string}`;
    description: string;
  }>;
  warnings: string[];
  officialSkillsUsed: string[];
  prizeMode: boolean;
  executionMode: SwapPlanningMode;
}

export interface CloseLpReceipt {
  walletAddress: `0x${string}`;
  tokenId: string;
  poolAddress: `0x${string}`;
  pair: string;
  steps: ExecutionStepReceipt[];
  finalPlan: CloseLpPlan;
}

export interface PreflightCheck {
  id: string;
  ok: boolean;
  message: string;
  remediation?: string;
}

export interface SkillCapabilityPrompt {
  id: string;
  capability: string;
  naturalLanguagePrompt: string;
  cliEquivalent?: string;
}

export interface PreflightStatus {
  ready: boolean;
  prizeMode: boolean;
  executionMode: SwapPlanningMode;
  officialSkillsUsed: string[];
  officialSkillPaths: string[];
  envFilePath?: string;
  checks: PreflightCheck[];
  capabilityPrompts: SkillCapabilityPrompt[];
  remediation: string[];
}
