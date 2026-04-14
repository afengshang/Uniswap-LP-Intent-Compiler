import { createRequire } from "node:module";

import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  http,
  parseAbiItem
} from "viem";
import { createPublicClient } from "viem";

import { erc20Abi, positionManagerAbi, transferEvent } from "./abis.js";
import { discoverCandidatePools, getFullCandidateUniverse, publicClient } from "./candidate.js";
import {
  DEADLINE_SECONDS,
  NATIVE_OKB_SENTINEL,
  SLIPPAGE_BPS,
  UNISWAP_V3_FACTORY,
  UNISWAP_V3_POSITION_MANAGER,
  WOKB_ADDRESS,
  xlLayerChain
} from "./config.js";
import { parseIntent } from "./intent.js";
import { DEFAULT_SWAP_PLANNING_MODE, OFFICIAL_UNISWAP_SKILL_NAMES } from "./official-skills.js";
import {
  buildSwapApproval,
  buildSwapTx,
  executeContractCall,
  getWalletBalance,
  scanRequiresExplicitWarning,
  scanRequiresStop,
  scanTransaction
} from "./onchainos.js";
import {
  buildFundingPlan,
  classifyRangeStatus,
  deriveRangePlan,
  formatPairSymbol,
  tokenIsStable,
  withApprovalBuffer
} from "./strategy.js";
import type {
  CandidatePool,
  CloseLpPlan,
  CloseLpReceipt,
  ExecutionReceipt,
  ExecutionStepReceipt,
  InventorySnapshot,
  LPIntent,
  LPPlan,
  PositionHealth,
  SwapExecutionSource,
  SwapPlanningMode
} from "./types.js";
import { buildOfficialSwapRoute, hasUniswapApiKey } from "./uniswap.js";

const require = createRequire(import.meta.url);
const { Percent, Token } = require("@uniswap/sdk-core") as typeof import("@uniswap/sdk-core");
const { Pool, Position } = require("@uniswap/v3-sdk") as typeof import("@uniswap/v3-sdk");

const helperClient = createPublicClient({
  chain: xlLayerChain,
  transport: http(xlLayerChain.rpcUrls.default.http[0])
});

const MAX_UINT128 = (1n << 128n) - 1n;

interface PlanOptions {
  swapPlanningMode?: SwapPlanningMode;
}

interface OpenOptions extends PlanOptions {
  confirm: boolean;
}

interface SwapExecutionResult {
  approvals: ExecutionStepReceipt[];
  steps: ExecutionStepReceipt[];
  source: SwapExecutionSource;
  warnings: string[];
}

function humanToRaw(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * 10 ** decimals));
}

function bigintToHex(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}` as `0x${string}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function resolveSwapPlanningMode(requested?: SwapPlanningMode): SwapPlanningMode {
  if (requested === "fallback-onchainos") {
    return requested;
  }
  return hasUniswapApiKey() ? (requested ?? DEFAULT_SWAP_PLANNING_MODE) : "fallback-onchainos";
}

function parseOpenOptions(confirmOrOptions: boolean | OpenOptions | undefined): OpenOptions {
  if (typeof confirmOrOptions === "boolean") {
    return { confirm: confirmOrOptions };
  }
  return confirmOrOptions ?? { confirm: false };
}

function parsePairSelection(candidates: CandidatePool[], intent: LPIntent): CandidatePool | undefined {
  if (intent.poolAddressHint) {
    return candidates.find((pool) => pool.address.toLowerCase() === intent.poolAddressHint?.toLowerCase());
  }
  if (!intent.pairHint) {
    return undefined;
  }
  const pairVariants = new Set(
    [intent.pairHint]
      .map((item) => item.toUpperCase())
      .flatMap((pair) => {
        const [left, right] = pair.split("/");
        return [`${left}/${right}`, `${right}/${left}`];
      })
  );
  return candidates.find((pool) => pairVariants.has(formatPairSymbol(pool.token0, pool.token1).toUpperCase()));
}

async function enrichFundingPlan(plan: LPPlan): Promise<LPPlan> {
  if (!plan.selectedPool || !plan.targetAmount0 || !plan.targetAmount1) {
    return plan;
  }

  try {
    const inventory = await getInventory(plan.selectedPool);
    plan.fundingPlan = buildFundingPlan(
      plan.selectedPool,
      inventory,
      plan.targetAmount0,
      plan.targetAmount1,
      plan.swapPlanningMode
    );
    plan.warnings = uniqueStrings([...plan.warnings, ...plan.fundingPlan.warnings]);
  } catch (error) {
    plan.warnings = uniqueStrings([
      ...plan.warnings,
      `Wallet inventory check failed during planning: ${error instanceof Error ? error.message : String(error)}`
    ]);
  }

  return plan;
}

export async function planLp(intentInput: string | LPIntent, options: PlanOptions = {}): Promise<LPPlan> {
  const intent = typeof intentInput === "string" ? parseIntent(intentInput) : intentInput;
  const requestedMode = options.swapPlanningMode;
  const swapPlanningMode = resolveSwapPlanningMode(requestedMode);
  const prizeMode = swapPlanningMode === "official-skills-hybrid";

  const fullUniverse = await getFullCandidateUniverse();
  const filteredCandidates = await discoverCandidatePools(intent);
  const candidateSource = filteredCandidates.length > 0 ? filteredCandidates : fullUniverse;
  const selectedPool = parsePairSelection(candidateSource, intent);
  const warnings: string[] = [];

  if (requestedMode === "official-skills-hybrid" && swapPlanningMode !== requestedMode) {
    warnings.push("UNISWAP_API_KEY is missing, so swap planning downgraded to fallback-onchainos mode.");
  }

  if (!selectedPool) {
    const candidateFallback = fullUniverse.slice(0, 5);
    const plan: LPPlan = {
      intent,
      candidates: candidateFallback,
      suggestedPoolAddress: candidateFallback[0]?.address,
      warnings: [
        ...warnings,
        "No pool was selected. Choose one of the ranked candidates before opening an LP."
      ],
      officialSkillsUsed: [...OFFICIAL_UNISWAP_SKILL_NAMES],
      analyticsSources: uniqueStrings(candidateFallback.flatMap((candidate) => candidate.analyticsSources)),
      swapPlanningMode,
      prizeMode
    };
    return plan;
  }

  const range = deriveRangePlan(selectedPool, intent.riskProfile);
  const targetAmount0Human = intent.depositUsd / 2 / selectedPool.token0.priceUsd;
  const targetAmount1Human = intent.depositUsd / 2 / selectedPool.token1.priceUsd;
  const targetAmount0 = humanToRaw(targetAmount0Human, selectedPool.token0.decimals);
  const targetAmount1 = humanToRaw(targetAmount1Human, selectedPool.token1.decimals);

  const plan: LPPlan = {
    intent,
    selectedPool,
    candidates: fullUniverse.slice(0, 5),
    suggestedPoolAddress: selectedPool.address,
    range,
    pairArchetype: selectedPool.pairArchetype,
    targetAmount0,
    targetAmount1,
    targetAmount0Human,
    targetAmount1Human,
    warnings: uniqueStrings([...warnings, ...selectedPool.warnings]),
    officialSkillsUsed: [...OFFICIAL_UNISWAP_SKILL_NAMES],
    analyticsSources: uniqueStrings(selectedPool.analyticsSources),
    swapPlanningMode,
    prizeMode
  };

  return enrichFundingPlan(plan);
}

async function getInventory(pool: CandidatePool): Promise<InventorySnapshot> {
  const wallet = await getWalletBalance();
  const walletAddress = getAddress(wallet.evmAddress.toLowerCase()) as `0x${string}`;
  const [nativeOkb, token0Balance, token1Balance] = await Promise.all([
    helperClient.getBalance({ address: walletAddress }),
    helperClient.readContract({
      address: pool.token0.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress]
    }),
    helperClient.readContract({
      address: pool.token1.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress]
    })
  ]);

  return {
    walletAddress,
    nativeOkb,
    token0Balance,
    token1Balance,
    token0BalanceHuman: Number(formatUnits(token0Balance, pool.token0.decimals)),
    token1BalanceHuman: Number(formatUnits(token1Balance, pool.token1.decimals))
  };
}

async function getCurrentWalletAddress(): Promise<`0x${string}`> {
  const wallet = await getWalletBalance();
  return getAddress(wallet.evmAddress.toLowerCase()) as `0x${string}`;
}

function createSdkPool(pool: CandidatePool) {
  const token0 = new Token(xlLayerChain.id, pool.token0.address, pool.token0.decimals, pool.token0.symbol, pool.token0.name);
  const token1 = new Token(xlLayerChain.id, pool.token1.address, pool.token1.decimals, pool.token1.symbol, pool.token1.name);
  return new Pool(
    token0,
    token1,
    pool.fee,
    pool.sqrtPriceX96.toString(),
    pool.liquidity.toString(),
    pool.currentTick
  );
}

async function readAllowance(token: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`): Promise<bigint> {
  return helperClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender]
  });
}

async function ensureScannedOrThrow(params: {
  from: `0x${string}`;
  to: `0x${string}`;
  data: string;
  value?: bigint;
}): Promise<void> {
  const scan = await scanTransaction({
    from: params.from,
    to: params.to,
    data: params.data,
    valueHex: params.value !== undefined ? bigintToHex(params.value) : undefined
  });
  if (scanRequiresStop(scan)) {
    throw new Error(`Security scan blocked transaction: ${JSON.stringify(scan)}`);
  }
  if (scanRequiresExplicitWarning(scan)) {
    throw new Error(`Security scan requires explicit review before proceeding: ${JSON.stringify(scan)}`);
  }
}

async function waitForReceipt(txHash: `0x${string}`) {
  return helperClient.waitForTransactionReceipt({ hash: txHash });
}

async function executeWrap(walletAddress: `0x${string}`, amount: bigint): Promise<ExecutionStepReceipt> {
  const data = "0xd0e30db0";
  await ensureScannedOrThrow({
    from: walletAddress,
    to: WOKB_ADDRESS,
    data,
    value: amount
  });
  const result = await executeContractCall({
    to: WOKB_ADDRESS,
    inputData: data,
    value: formatEther(amount),
    from: walletAddress
  });
  if (!result.txHash) {
    throw new Error(`Wrap action was not broadcast: ${JSON.stringify(result.confirming)}`);
  }
  await waitForReceipt(result.txHash);
  return {
    kind: "wrap",
    target: WOKB_ADDRESS,
    txHash: result.txHash,
    details: {
      amount: amount.toString()
    }
  };
}

async function executeApprovalIfNeeded(params: {
  owner: `0x${string}`;
  token: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  mode?: "direct" | "swap-helper";
}): Promise<ExecutionStepReceipt | null> {
  if (params.token.toLowerCase() === NATIVE_OKB_SENTINEL.toLowerCase()) {
    return null;
  }
  const currentAllowance = await readAllowance(params.token, params.owner, params.spender);
  const requiredAmount = withApprovalBuffer(params.amount);
  if (currentAllowance >= requiredAmount) {
    return null;
  }
  const approval =
    params.mode === "swap-helper"
      ? await buildSwapApproval(params.token, requiredAmount)
      : {
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [params.spender, requiredAmount]
          }),
          dexContractAddress: params.spender
        };
  await ensureScannedOrThrow({
    from: params.owner,
    to: params.token,
    data: approval.data
  });
  const result = await executeContractCall({
    to: params.token,
    inputData: approval.data,
    from: params.owner
  });
  if (!result.txHash) {
    throw new Error(`Approval was not broadcast: ${JSON.stringify(result.confirming)}`);
  }
  await waitForReceipt(result.txHash);
  return {
    kind: "approve",
    target: params.token,
    txHash: result.txHash,
    details: {
      spender: params.spender,
      amount: requiredAmount.toString()
    }
  };
}

async function executeOnchainosSwapAction(params: {
  walletAddress: `0x${string}`;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  amountIn: bigint;
}): Promise<SwapExecutionResult> {
  const approvals: ExecutionStepReceipt[] = [];
  const steps: ExecutionStepReceipt[] = [];

  if (params.fromToken.toLowerCase() !== NATIVE_OKB_SENTINEL.toLowerCase()) {
    const swapApprovalPayload = await buildSwapApproval(params.fromToken, withApprovalBuffer(params.amountIn));
    const approval = await executeApprovalIfNeeded({
      owner: params.walletAddress,
      token: params.fromToken,
      spender: swapApprovalPayload.dexContractAddress,
      amount: params.amountIn,
      mode: "swap-helper"
    });
    if (approval) {
      approvals.push(approval);
    }
  }

  const swapPayload = await buildSwapTx({
    fromToken: params.fromToken,
    toToken: params.toToken,
    amountIn: params.amountIn,
    wallet: params.walletAddress
  });

  await ensureScannedOrThrow({
    from: params.walletAddress,
    to: swapPayload.tx.to,
    data: swapPayload.tx.data,
    value: BigInt(swapPayload.tx.value)
  });

  const result = await executeContractCall({
    to: swapPayload.tx.to,
    inputData: swapPayload.tx.data,
    value: formatEther(BigInt(swapPayload.tx.value)),
    from: params.walletAddress
  });
  if (!result.txHash) {
    throw new Error(`Swap was not broadcast: ${JSON.stringify(result.confirming)}`);
  }
  await waitForReceipt(result.txHash);
  steps.push({
    kind: "swap",
    target: swapPayload.tx.to,
    txHash: result.txHash,
    details: {
      fromToken: params.fromToken,
      toToken: params.toToken,
      amountIn: params.amountIn.toString(),
      quote: swapPayload.routerResult
    }
  });

  return {
    approvals,
    steps,
    source: "onchainos-dex",
    warnings: []
  };
}

function parseApprovalSpender(data: string): `0x${string}` | undefined {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: data as `0x${string}`
    });
    if (decoded.functionName !== "approve") {
      return undefined;
    }
    const [spender] = decoded.args ?? [];
    return spender as `0x${string}` | undefined;
  } catch {
    return undefined;
  }
}

async function executeOfficialSwapAction(params: {
  walletAddress: `0x${string}`;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  amountIn: bigint;
  allowFallback: boolean;
}): Promise<SwapExecutionResult> {
  try {
    const route = await buildOfficialSwapRoute({
      walletAddress: params.walletAddress,
      fromToken: params.fromToken,
      toToken: params.toToken,
      amountIn: params.amountIn
    });

    const approvals: ExecutionStepReceipt[] = [];
    const steps: ExecutionStepReceipt[] = [];

    if (route.approval && params.fromToken.toLowerCase() !== NATIVE_OKB_SENTINEL.toLowerCase()) {
      const spender = parseApprovalSpender(route.approval.data);
      if (!spender) {
        throw new Error("Trading API approval payload did not decode into a spender.");
      }
      const approval = await executeApprovalIfNeeded({
        owner: params.walletAddress,
        token: params.fromToken,
        spender,
        amount: params.amountIn,
        mode: "direct"
      });
      if (approval) {
        approvals.push(approval);
      }
    }

    await ensureScannedOrThrow({
      from: params.walletAddress,
      to: route.swap.to,
      data: route.swap.data,
      value: BigInt(route.swap.value || "0")
    });

    const result = await executeContractCall({
      to: route.swap.to,
      inputData: route.swap.data,
      value: route.swap.value && route.swap.value !== "0" ? formatEther(BigInt(route.swap.value)) : undefined,
      from: params.walletAddress
    });
    if (!result.txHash) {
      throw new Error(`Official swap was not broadcast: ${JSON.stringify(result.confirming)}`);
    }
    await waitForReceipt(result.txHash);

    steps.push({
      kind: "swap",
      target: route.swap.to,
      txHash: result.txHash,
      details: {
        fromToken: params.fromToken,
        toToken: params.toToken,
        amountIn: params.amountIn.toString(),
        routing: route.routing,
        swapExecutionSource: "uniswap-trading-api"
      }
    });

    return {
      approvals,
      steps,
      source: "uniswap-trading-api",
      warnings: []
    };
  } catch (error) {
    if (!params.allowFallback) {
      throw error;
    }
    const fallback = await executeOnchainosSwapAction(params);
    return {
      ...fallback,
      warnings: [
        `Uniswap Trading API route failed, so execution fell back to OnchainOS DEX routing: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }
}

async function executeSwapAction(params: {
  walletAddress: `0x${string}`;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  amountIn: bigint;
  swapPlanningMode: SwapPlanningMode;
  allowFallback: boolean;
}): Promise<SwapExecutionResult> {
  if (params.swapPlanningMode === "official-skills-hybrid") {
    return executeOfficialSwapAction(params);
  }
  return executeOnchainosSwapAction(params);
}

function getDesiredMintAmounts(
  inventory: InventorySnapshot,
  pool: CandidatePool,
  targetAmount0: bigint,
  targetAmount1: bigint
): { amount0: bigint; amount1: bigint } {
  const available0 = inventory.token0Balance < targetAmount0 ? inventory.token0Balance : targetAmount0;
  const available1 = inventory.token1Balance < targetAmount1 ? inventory.token1Balance : targetAmount1;

  if (available0 <= 0n || available1 <= 0n) {
    throw new Error("Wallet inventory is insufficient to build both LP legs after funding actions.");
  }

  if (available0 < targetAmount0 || available1 < targetAmount1) {
    throw new Error(
      `Wallet inventory is still short after funding actions for ${formatPairSymbol(pool.token0, pool.token1)}.`
    );
  }

  return {
    amount0: available0,
    amount1: available1
  };
}

export async function openLp(
  intentInput: string | LPIntent,
  confirmOrOptions?: boolean | OpenOptions
): Promise<LPPlan | ExecutionReceipt> {
  const options = parseOpenOptions(confirmOrOptions);
  const plan = await planLp(intentInput, options);
  if (!plan.selectedPool || !plan.range || !plan.targetAmount0 || !plan.targetAmount1) {
    return plan;
  }

  const inventory = await getInventory(plan.selectedPool);
  const fundingPlan = buildFundingPlan(
    plan.selectedPool,
    inventory,
    plan.targetAmount0,
    plan.targetAmount1,
    plan.swapPlanningMode
  );
  plan.fundingPlan = fundingPlan;
  plan.warnings = uniqueStrings([...plan.warnings, ...fundingPlan.warnings]);

  if (!options.confirm) {
    plan.warnings = uniqueStrings([
      ...plan.warnings,
      "Pass --confirm only after reviewing the ranked pool, swap planning mode, and funding actions."
    ]);
    return plan;
  }

  const approvals: ExecutionStepReceipt[] = [];
  const steps: ExecutionStepReceipt[] = [];
  let swapExecutionSource: SwapExecutionSource = "not-needed";

  for (const action of fundingPlan.actions) {
    if (action.kind === "wrap") {
      steps.push(await executeWrap(inventory.walletAddress, action.amount));
      continue;
    }

    const swapResult = await executeSwapAction({
      walletAddress: inventory.walletAddress,
      fromToken: action.fromToken,
      toToken: action.toToken,
      amountIn: action.amountIn,
      swapPlanningMode: action.planningMode,
      allowFallback: action.fallbackAvailable
    });
    approvals.push(...swapResult.approvals);
    steps.push(...swapResult.steps);
    swapExecutionSource = swapResult.source;
    plan.warnings = uniqueStrings([...plan.warnings, ...swapResult.warnings]);
  }

  const refreshedInventory = await getInventory(plan.selectedPool);
  const desiredMint = getDesiredMintAmounts(
    refreshedInventory,
    plan.selectedPool,
    plan.targetAmount0,
    plan.targetAmount1
  );
  const sdkPool = createSdkPool(plan.selectedPool);
  const position = Position.fromAmounts({
    pool: sdkPool,
    tickLower: plan.range.lowerTick,
    tickUpper: plan.range.upperTick,
    amount0: desiredMint.amount0.toString(),
    amount1: desiredMint.amount1.toString(),
    useFullPrecision: true
  });

  const mintAmounts = position.mintAmounts;
  const slippage = new Percent(SLIPPAGE_BPS, 10_000);
  const mintAmountsWithSlippage = position.mintAmountsWithSlippage(slippage);
  const amount0Desired = BigInt(mintAmounts.amount0.toString());
  const amount1Desired = BigInt(mintAmounts.amount1.toString());
  const amount0Min = BigInt(mintAmountsWithSlippage.amount0.toString());
  const amount1Min = BigInt(mintAmountsWithSlippage.amount1.toString());

  const approval0 = await executeApprovalIfNeeded({
    owner: inventory.walletAddress,
    token: plan.selectedPool.token0.address,
    spender: UNISWAP_V3_POSITION_MANAGER,
    amount: amount0Desired,
    mode: "direct"
  });
  if (approval0) {
    approvals.push(approval0);
  }

  const approval1 = await executeApprovalIfNeeded({
    owner: inventory.walletAddress,
    token: plan.selectedPool.token1.address,
    spender: UNISWAP_V3_POSITION_MANAGER,
    amount: amount1Desired,
    mode: "direct"
  });
  if (approval1) {
    approvals.push(approval1);
  }

  const mintData = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: "mint",
    args: [
      {
        token0: plan.selectedPool.token0.address,
        token1: plan.selectedPool.token1.address,
        fee: plan.selectedPool.fee,
        tickLower: plan.range.lowerTick,
        tickUpper: plan.range.upperTick,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient: inventory.walletAddress,
        deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
      }
    ]
  });

  await ensureScannedOrThrow({
    from: inventory.walletAddress,
    to: UNISWAP_V3_POSITION_MANAGER,
    data: mintData,
    value: 0n
  });

  const lpCall = await executeContractCall({
    to: UNISWAP_V3_POSITION_MANAGER,
    inputData: mintData,
    from: inventory.walletAddress
  });
  if (!lpCall.txHash) {
    throw new Error(`LP mint was not broadcast: ${JSON.stringify(lpCall.confirming)}`);
  }
  const receipt = await waitForReceipt(lpCall.txHash);

  let tokenId: string | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics
      });
      if (decoded.eventName === "Transfer" && String(decoded.args.from).toLowerCase() === "0x0000000000000000000000000000000000000000") {
        tokenId = decoded.args.tokenId?.toString();
        break;
      }
    } catch {
      continue;
    }
  }

  return {
    walletAddress: inventory.walletAddress,
    poolAddress: plan.selectedPool.address,
    approvals,
    steps,
    lpTxHash: lpCall.txHash,
    tokenId,
    finalPlan: plan,
    swapExecutionSource,
    officialSkillsUsed: [...OFFICIAL_UNISWAP_SKILL_NAMES],
    prizeMode: plan.prizeMode,
    executionMode: plan.swapPlanningMode
  };
}

async function getPosition(tokenId: bigint) {
  return helperClient.readContract({
    address: UNISWAP_V3_POSITION_MANAGER,
    abi: positionManagerAbi,
    functionName: "positions",
    args: [tokenId]
  });
}

async function getPositionPool(position: Awaited<ReturnType<typeof getPosition>>): Promise<CandidatePool> {
  const poolAddress = await helperClient.readContract({
    address: UNISWAP_V3_FACTORY,
    abi: [
      parseAbiItem(
        "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)"
      )
    ],
    functionName: "getPool",
    args: [position[2], position[3], position[4]]
  });
  const candidates = await getFullCandidateUniverse();
  const selectedPool = candidates.find((item) => item.address.toLowerCase() === String(poolAddress).toLowerCase());
  if (!selectedPool) {
    throw new Error(`Pool metadata not found for ${poolAddress}`);
  }
  return selectedPool;
}

async function getPositionOwner(tokenId: bigint): Promise<`0x${string}`> {
  return helperClient.readContract({
    address: UNISWAP_V3_POSITION_MANAGER,
    abi: positionManagerAbi,
    functionName: "ownerOf",
    args: [tokenId]
  }) as Promise<`0x${string}`>;
}

export async function monitorPosition(tokenIdInput: string): Promise<PositionHealth> {
  const tokenId = BigInt(tokenIdInput);
  const position = await getPosition(tokenId);
  const selectedPool = await getPositionPool(position);
  const slot0 = await helperClient.readContract({
    address: selectedPool.address,
    abi: [
      parseAbiItem(
        "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
      )
    ],
    functionName: "slot0"
  });
  const currentTick = Number(slot0[1]);
  const lowerTick = Number(position[5]);
  const upperTick = Number(position[6]);
  const rangeStatus = classifyRangeStatus(currentTick, lowerTick, upperTick);
  const currentPriceToken1PerToken0 = selectedPool.currentPriceToken1PerToken0;

  return {
    tokenId: tokenId.toString(),
    poolAddress: selectedPool.address,
    pair: formatPairSymbol(selectedPool.token0, selectedPool.token1),
    currentTick,
    lowerTick,
    upperTick,
    currentPriceToken1PerToken0,
    rangeStatus,
    feesOwed0: formatUnits(position[10], selectedPool.token0.decimals),
    feesOwed1: formatUnits(position[11], selectedPool.token1.decimals),
    recommendation:
      rangeStatus === "out_of_range"
        ? "Current price is out of range. Rebuild the position around the current price before fees stall."
        : rangeStatus === "near_edge"
          ? "Price is approaching a range boundary. Prepare a reposition plan."
          : "Position is still healthy and in range."
  };
}

export async function planCloseLp(tokenIdInput: string): Promise<CloseLpPlan> {
  const tokenId = BigInt(tokenIdInput);
  const [position, walletAddress, owner] = await Promise.all([
    getPosition(tokenId),
    getCurrentWalletAddress(),
    getPositionOwner(tokenId)
  ]);
  const selectedPool = await getPositionPool(position);
  const health = await monitorPosition(tokenIdInput);
  const liquidity = position[7];
  const tokensOwed0 = position[10];
  const tokensOwed1 = position[11];
  const sdkPool = createSdkPool(selectedPool);
  const sdkPosition = new Position({
    pool: sdkPool,
    liquidity: liquidity.toString(),
    tickLower: Number(position[5]),
    tickUpper: Number(position[6])
  });
  const burnAmounts = liquidity > 0n ? sdkPosition.burnAmountsWithSlippage(new Percent(SLIPPAGE_BPS, 10_000)) : { amount0: 0n, amount1: 0n };
  const amount0Min = BigInt(burnAmounts.amount0.toString());
  const amount1Min = BigInt(burnAmounts.amount1.toString());
  const warnings: string[] = [
    "Close LP is dry-run by default. Pass --confirm only after reviewing expected tokens and tx-scan behavior.",
    "This v1 close flow removes liquidity and collects tokens, but does not auto-burn the LP NFT."
  ];

  if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
    warnings.push("Connected Agentic Wallet is not the owner of this LP NFT, so execution will stop unless ownership changes.");
  }
  if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) {
    warnings.push("This LP has no active liquidity or owed tokens to collect.");
  }

  return {
    tokenId: tokenId.toString(),
    walletAddress,
    owner: getAddress(owner) as `0x${string}`,
    poolAddress: selectedPool.address,
    pair: formatPairSymbol(selectedPool.token0, selectedPool.token1),
    currentStatus: health.rangeStatus,
    currentTick: health.currentTick,
    lowerTick: Number(position[5]),
    upperTick: Number(position[6]),
    liquidity: liquidity.toString(),
    estimatedAmount0Min: amount0Min.toString(),
    estimatedAmount1Min: amount1Min.toString(),
    estimatedAmount0MinHuman: formatUnits(amount0Min, selectedPool.token0.decimals),
    estimatedAmount1MinHuman: formatUnits(amount1Min, selectedPool.token1.decimals),
    tokensOwed0: formatUnits(tokensOwed0, selectedPool.token0.decimals),
    tokensOwed1: formatUnits(tokensOwed1, selectedPool.token1.decimals),
    actions: [
      ...(liquidity > 0n
        ? [
            {
              kind: "decrease_liquidity" as const,
              target: UNISWAP_V3_POSITION_MANAGER,
              description: "Remove all active Uniswap v3 liquidity from the LP NFT."
            }
          ]
        : []),
      {
        kind: "collect",
        target: UNISWAP_V3_POSITION_MANAGER,
        description: "Collect principal tokens and accrued fees to the Agentic Wallet."
      }
    ],
    warnings,
    officialSkillsUsed: [...OFFICIAL_UNISWAP_SKILL_NAMES],
    prizeMode: hasUniswapApiKey(),
    executionMode: resolveSwapPlanningMode()
  };
}

export async function closeLp(tokenIdInput: string, confirm = false): Promise<CloseLpPlan | CloseLpReceipt> {
  const plan = await planCloseLp(tokenIdInput);
  if (!confirm) {
    return plan;
  }
  if (plan.owner.toLowerCase() !== plan.walletAddress.toLowerCase()) {
    throw new Error(`Connected wallet ${plan.walletAddress} does not own LP NFT ${plan.tokenId}. Owner is ${plan.owner}.`);
  }

  const tokenId = BigInt(tokenIdInput);
  const position = await getPosition(tokenId);
  const liquidity = position[7];
  const steps: ExecutionStepReceipt[] = [];

  if (liquidity > 0n) {
    const decreaseData = encodeFunctionData({
      abi: positionManagerAbi,
      functionName: "decreaseLiquidity",
      args: [
        {
          tokenId,
          liquidity,
          amount0Min: BigInt(plan.estimatedAmount0Min),
          amount1Min: BigInt(plan.estimatedAmount1Min),
          deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
        }
      ]
    });
    await ensureScannedOrThrow({
      from: plan.walletAddress,
      to: UNISWAP_V3_POSITION_MANAGER,
      data: decreaseData,
      value: 0n
    });
    const decreaseCall = await executeContractCall({
      to: UNISWAP_V3_POSITION_MANAGER,
      inputData: decreaseData,
      from: plan.walletAddress
    });
    if (!decreaseCall.txHash) {
      throw new Error(`LP decreaseLiquidity was not broadcast: ${JSON.stringify(decreaseCall.confirming)}`);
    }
    await waitForReceipt(decreaseCall.txHash);
    steps.push({
      kind: "decrease_liquidity",
      target: UNISWAP_V3_POSITION_MANAGER,
      txHash: decreaseCall.txHash,
      details: {
        tokenId: plan.tokenId,
        liquidity: liquidity.toString(),
        amount0Min: plan.estimatedAmount0Min,
        amount1Min: plan.estimatedAmount1Min
      }
    });
  }

  const collectData = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: "collect",
    args: [
      {
        tokenId,
        recipient: plan.walletAddress,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128
      }
    ]
  });
  await ensureScannedOrThrow({
    from: plan.walletAddress,
    to: UNISWAP_V3_POSITION_MANAGER,
    data: collectData,
    value: 0n
  });
  const collectCall = await executeContractCall({
    to: UNISWAP_V3_POSITION_MANAGER,
    inputData: collectData,
    from: plan.walletAddress
  });
  if (!collectCall.txHash) {
    throw new Error(`LP collect was not broadcast: ${JSON.stringify(collectCall.confirming)}`);
  }
  await waitForReceipt(collectCall.txHash);
  steps.push({
    kind: "collect",
    target: UNISWAP_V3_POSITION_MANAGER,
    txHash: collectCall.txHash,
    details: {
      tokenId: plan.tokenId,
      recipient: plan.walletAddress,
      amount0Max: MAX_UINT128.toString(),
      amount1Max: MAX_UINT128.toString()
    }
  });

  return {
    walletAddress: plan.walletAddress,
    tokenId: plan.tokenId,
    poolAddress: plan.poolAddress,
    pair: plan.pair,
    steps,
    finalPlan: plan
  };
}

export async function suggestReposition(tokenId: string) {
  const health = await monitorPosition(tokenId);
  const candidates = await getFullCandidateUniverse();
  const pool = candidates.find((item) => item.address.toLowerCase() === health.poolAddress.toLowerCase());
  if (!pool) {
    throw new Error(`Pool metadata unavailable for ${health.poolAddress}`);
  }

  const suggestedRange = deriveRangePlan(pool, health.rangeStatus === "out_of_range" ? "balanced" : "conservative");

  return {
    tokenId,
    pair: formatPairSymbol(pool.token0, pool.token1),
    pairArchetype: pool.pairArchetype,
    currentStatus: health.rangeStatus,
    suggestedRange: {
      lowerTick: suggestedRange.lowerTick,
      upperTick: suggestedRange.upperTick,
      lowerPrice: suggestedRange.lowerPrice,
      upperPrice: suggestedRange.upperPrice,
      source: suggestedRange.source
    },
    recommendation:
      health.rangeStatus === "in_range"
        ? "No immediate reposition is required, but this official liquidity-planner-aligned range is a good next rebalance template."
        : "Remove liquidity, collect fees, and recreate the position around the current price using the suggested official-skill-aligned range.",
    rationale: [
      `Current range status: ${health.rangeStatus}.`,
      `Current price proxy: ${health.currentPriceToken1PerToken0.toFixed(6)} ${pool.token1.symbol}/${pool.token0.symbol}.`,
      tokenIsStable(pool.token0) && tokenIsStable(pool.token1)
        ? "Stable/stable pair allows tighter recentering."
        : "Volatile pair should only be re-entered after reviewing the refreshed range."
    ]
  };
}
