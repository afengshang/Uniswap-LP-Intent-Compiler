import { spawn } from "node:child_process";
import { XLAYER_CHAIN_ID } from "./config.js";
const ONCHAIN_OS_BIN = process.platform === "win32" ? "onchainos.exe" : "onchainos";
const DEFAULT_RETRY_ATTEMPTS = 4;
const INITIAL_RETRY_DELAY_MS = 800;
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function shouldRetryRateLimit(payload) {
    if (payload.includes("Rate limited")) {
        return true;
    }
    try {
        const parsed = JSON.parse(payload);
        return String(parsed.error ?? parsed.message ?? "").includes("Rate limited");
    }
    catch {
        return false;
    }
}
function runRawCommand(args) {
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
async function runJsonCommand(args, retries = DEFAULT_RETRY_ATTEMPTS) {
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
        const parsed = JSON.parse(payload);
        if (exitCode !== 0 && exitCode !== 2 && parsed.ok !== true) {
            throw new Error(payload);
        }
        if (parsed.data === undefined && !("action" in parsed) && !parsed.confirming) {
            throw new Error(payload);
        }
        return {
            exitCode,
            data: (parsed.data ?? parsed)
        };
    }
    throw new Error(`Command failed after retries: onchainos ${args.join(" ")}`);
}
export async function getWalletBalance() {
    const result = await runJsonCommand(["wallet", "balance"]);
    return result.data;
}
export async function searchTokenByAddress(address) {
    const items = await searchTokenQuery(address);
    if (!items[0]) {
        throw new Error(`Token metadata not found for ${address}`);
    }
    return items[0];
}
export async function searchTokenQuery(query) {
    const result = await runJsonCommand([
        "token",
        "search",
        "--query",
        query,
        "--chains",
        "xlayer"
    ]);
    return result.data;
}
export async function getMarketKlines(address, limit = 24) {
    const result = await runJsonCommand([
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
export async function buildSwapApproval(token, amount) {
    const result = await runJsonCommand([
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
export async function buildSwapTx(params) {
    const result = await runJsonCommand([
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
export async function scanTransaction(params) {
    const args = ["security", "tx-scan", "--from", params.from, "--to", params.to, "--chain", "xlayer", "--data", params.data];
    if (params.valueHex) {
        args.push("--value", params.valueHex);
    }
    const result = await runJsonCommand(args);
    return result.data;
}
export async function executeContractCall(params) {
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
    const parsed = JSON.parse(payload);
    if ("confirming" in parsed || exitCode === 2) {
        return { confirming: parsed };
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
export function scanRequiresStop(result) {
    return result.action === "block";
}
export function scanRequiresExplicitWarning(result) {
    return result.action === "warn";
}
