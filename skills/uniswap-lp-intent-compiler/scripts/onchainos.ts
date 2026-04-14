import { spawn } from "node:child_process";

import { XLAYER_CHAIN_ID } from "./config.js";
import type { ScanResult } from "./types.js";

const ONCHAIN_OS_BIN = process.platform === "win32" ? "onchainos.exe" : "onchainos";

interface CommandResult<T> {
  exitCode: number;
  data: T;
}

interface WalletBalanceResponse {
  accountId: string;
  accountName: string;
  evmAddress: `0x${string}`;
  totalValueUsd: string;
}

interface TokenSearchResponseItem {
  tokenContractAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  decimal: string;
  price: string;
  change: string;
  liquidity: string;
  holders: string;
  tagList?: {
    communityRecognized?: boolean;
  };
}

interface MarketKlineResponseItem {
  c: string;
  o: string;
  h: string;
  l: string;
  volUsd: string;
  ts: string;
}

interface SwapApprovalPayload {
  data: string;
  dexContractAddress: `0x${string}`;
  gasLimit: string;
  gasPrice: string;
}

interface SwapPayload {
  routerResult: Record<string, unknown>;
  tx: {
    data: string;
    to: `0x${string}`;
    value: string;
    minReceiveAmount?: string;
    slippagePercent?: string;
  };
}

interface ContractCallResponse {
  txHash: `0x${string}`;
}

const DEFAULT_RETRY_ATTEMPTS = 4;
const INITIAL_RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryRateLimit(payload: string): boolean {
  if (payload.includes("Rate limited")) {
    return true;
  }
  try {
    const parsed = JSON.parse(payload) as { error?: string; message?: string };
    return String(parsed.error ?? parsed.message ?? "").includes("Rate limited");
  } catch {
    return false;
  }
}

function runRawCommand(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ONCHAIN_OS_BIN, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function runJsonCommand<T>(args: string[], retries = DEFAULT_RETRY_ATTEMPTS): Promise<CommandResult<T>> {
  let delayMs = INITIAL_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { exitCode, stdout, stderr } = await runRawCommand(args);
    const payload = stdout || stderr;
    if (!payload) {
      throw new Error(`Command produced no output: onchainos ${args.join(" ")}`);
    }

    if (attempt < retries && shouldRetryRateLimit(payload)) {
      await sleep(delayMs);
      delayMs *= 2;
      continue;
    }

    const parsed = JSON.parse(payload) as { ok?: boolean; data?: T; action?: string; confirming?: boolean; message?: string };
    if (exitCode !== 0 && exitCode !== 2 && parsed.ok !== true) {
      throw new Error(payload);
    }
    if (parsed.data === undefined && !("action" in parsed) && !(parsed as { confirming?: boolean }).confirming) {
      throw new Error(payload);
    }
    return {
      exitCode,
      data: (parsed.data ?? (parsed as unknown as T))
    };
  }

  throw new Error(`Command failed after retries: onchainos ${args.join(" ")}`);
}

export async function getWalletBalance(): Promise<WalletBalanceResponse> {
  const result = await runJsonCommand<WalletBalanceResponse>(["wallet", "balance"]);
  return result.data;
}

export async function searchTokenByAddress(address: `0x${string}`): Promise<TokenSearchResponseItem> {
  const items = await searchTokenQuery(address);
  if (!items[0]) {
    throw new Error(`Token metadata not found for ${address}`);
  }
  return items[0];
}

export async function searchTokenQuery(query: string): Promise<TokenSearchResponseItem[]> {
  const result = await runJsonCommand<TokenSearchResponseItem[]>([
    "token",
    "search",
    "--query",
    query,
    "--chains",
    "xlayer"
  ]);
  return result.data;
}

export async function getMarketKlines(address: `0x${string}`, limit = 24): Promise<MarketKlineResponseItem[]> {
  const result = await runJsonCommand<MarketKlineResponseItem[]>([
    "market",
    "kline",
    "--address",
    address,
    "--chain",
    "xlayer",
    "--bar",
    "1H",
    "--limit",
    String(limit)
  ]);
  return result.data;
}

export async function buildSwapApproval(token: `0x${string}`, amount: bigint): Promise<SwapApprovalPayload> {
  const result = await runJsonCommand<SwapApprovalPayload[]>([
    "swap",
    "approve",
    "--token",
    token,
    "--amount",
    amount.toString(),
    "--chain",
    "xlayer"
  ]);
  if (!result.data[0]) {
    throw new Error(`Approval payload missing for ${token}`);
  }
  return result.data[0];
}

export async function buildSwapTx(params: {
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  amountIn: bigint;
  wallet: `0x${string}`;
}): Promise<SwapPayload> {
  const result = await runJsonCommand<SwapPayload[]>([
    "swap",
    "swap",
    "--from",
    params.fromToken,
    "--to",
    params.toToken,
    "--amount",
    params.amountIn.toString(),
    "--chain",
    "xlayer",
    "--wallet",
    params.wallet
  ]);
  if (!result.data[0]) {
    throw new Error(`Swap payload missing for ${params.fromToken} -> ${params.toToken}`);
  }
  return result.data[0];
}

export async function scanTransaction(params: {
  from: `0x${string}`;
  to: `0x${string}`;
  data: string;
  valueHex?: `0x${string}`;
}): Promise<ScanResult> {
  const args = ["security", "tx-scan", "--from", params.from, "--to", params.to, "--chain", "xlayer", "--data", params.data];
  if (params.valueHex) {
    args.push("--value", params.valueHex);
  }
  const result = await runJsonCommand<ScanResult>(args);
  return result.data;
}

export async function executeContractCall(params: {
  to: `0x${string}`;
  inputData: string;
  value?: string;
  from?: `0x${string}`;
}): Promise<{ txHash?: `0x${string}`; confirming?: Record<string, unknown> }> {
  const args = ["wallet", "contract-call", "--to", params.to, "--chain", String(XLAYER_CHAIN_ID), "--input-data", params.inputData];
  if (params.value && params.value !== "0") {
    args.push("--value", params.value);
  }
  if (params.from) {
    args.push("--from", params.from);
  }

  const { exitCode, stdout, stderr } = await runRawCommand(args);
  const payload = stdout || stderr;
  if (!payload) {
    throw new Error(`Contract call produced no output for ${params.to}`);
  }
  const parsed = JSON.parse(payload) as
    | { ok: true; data?: ContractCallResponse; txHash?: `0x${string}` }
    | { confirming: true; message: string; next?: string }
    | { ok: false; error?: string; message?: string };

  if ("confirming" in parsed || exitCode === 2) {
    return { confirming: parsed as Record<string, unknown> };
  }
  if ("ok" in parsed && parsed.ok === false) {
    throw new Error(parsed.error ?? parsed.message ?? payload);
  }
  const txHash = "data" in parsed && parsed.data?.txHash ? parsed.data.txHash : "txHash" in parsed ? parsed.txHash : undefined;
  if (!txHash) {
    throw new Error(`Contract call succeeded but no txHash was returned: ${payload}`);
  }
  return { txHash };
}

export function scanRequiresStop(result: ScanResult): boolean {
  return result.action === "block";
}

export function scanRequiresExplicitWarning(result: ScanResult): boolean {
  return result.action === "warn";
}
