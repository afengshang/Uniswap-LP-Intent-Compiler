import { loadWorkspaceEnv } from "./env.js";
import { NATIVE_OKB_SENTINEL, UNISWAP_NATIVE_TOKEN_ADDRESS, XLAYER_CHAIN_ID } from "./config.js";
const UNISWAP_TRADE_API_BASE_URL = "https://trade-api.gateway.uniswap.org/v1";
const UNISWAP_ROUTER_VERSION = "2.0";
const DEFAULT_SLIPPAGE_TOLERANCE = 0.5;
const DEFAULT_ROUTING_PREFERENCE = "BEST_PRICE";
const DEFAULT_RETRY_ATTEMPTS = 4;
const INITIAL_RETRY_DELAY_MS = 800;
let defillamaPoolsPromise;
const dexscreenerTokenCache = new Map();
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function normalizeAddress(address) {
    return address.toLowerCase();
}
function getTradeApiHeaders() {
    loadWorkspaceEnv();
    const apiKey = process.env.UNISWAP_API_KEY;
    if (!apiKey) {
        throw new Error("UNISWAP_API_KEY is missing.");
    }
    return {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-universal-router-version": UNISWAP_ROUTER_VERSION
    };
}
function shouldRetryStatus(status) {
    return status === 429 || status >= 500;
}
async function postTradingApi(path, body, retries = DEFAULT_RETRY_ATTEMPTS) {
    let delayMs = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const response = await fetch(`${UNISWAP_TRADE_API_BASE_URL}${path}`, {
            method: "POST",
            headers: getTradeApiHeaders(),
            body: JSON.stringify(body)
        });
        const text = await response.text();
        if (response.ok) {
            return JSON.parse(text);
        }
        if (attempt < retries && shouldRetryStatus(response.status)) {
            await sleep(delayMs);
            delayMs *= 2;
            continue;
        }
        throw new Error(`Uniswap Trading API ${path} failed (${response.status}): ${text}`);
    }
    throw new Error(`Uniswap Trading API ${path} failed after retries.`);
}
function normalizeTradingToken(address) {
    return normalizeAddress(address) === normalizeAddress(NATIVE_OKB_SENTINEL)
        ? UNISWAP_NATIVE_TOKEN_ADDRESS
        : address;
}
export function hasUniswapApiKey() {
    loadWorkspaceEnv();
    return Boolean(process.env.UNISWAP_API_KEY);
}
export function buildTradingApprovalRequest(params) {
    return {
        walletAddress: params.walletAddress,
        token: normalizeTradingToken(params.token),
        amount: params.amount.toString(),
        chainId: XLAYER_CHAIN_ID
    };
}
export function buildTradingQuoteRequest(params) {
    return {
        swapper: params.walletAddress,
        tokenIn: normalizeTradingToken(params.fromToken),
        tokenOut: normalizeTradingToken(params.toToken),
        tokenInChainId: String(XLAYER_CHAIN_ID),
        tokenOutChainId: String(XLAYER_CHAIN_ID),
        amount: params.amountIn.toString(),
        type: "EXACT_INPUT",
        slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
        routingPreference: DEFAULT_ROUTING_PREFERENCE
    };
}
export function prepareTradingSwapRequest(quoteResponse, signature) {
    const { permitData, permitTransaction, ...cleanQuote } = quoteResponse;
    const request = { ...cleanQuote };
    const routing = String(quoteResponse.routing ?? "");
    const isUniswapX = routing === "DUTCH_V2" || routing === "DUTCH_V3" || routing === "PRIORITY";
    if (isUniswapX) {
        if (signature) {
            request.signature = signature;
        }
        return request;
    }
    if (signature && permitData && typeof permitData === "object") {
        request.signature = signature;
        request.permitData = permitData;
    }
    return request;
}
export function validateTradingSwapResponse(response) {
    if (!response.swap?.data || response.swap.data === "0x") {
        throw new Error("Uniswap Trading API returned empty swap calldata.");
    }
    if (!response.swap.to || !response.swap.from) {
        throw new Error("Uniswap Trading API returned an invalid swap address set.");
    }
}
export async function buildOfficialSwapRoute(params) {
    loadWorkspaceEnv();
    const fromToken = normalizeTradingToken(params.fromToken);
    const approval = normalizeAddress(fromToken) === normalizeAddress(UNISWAP_NATIVE_TOKEN_ADDRESS)
        ? null
        : await postTradingApi("/check_approval", buildTradingApprovalRequest({
            walletAddress: params.walletAddress,
            token: params.fromToken,
            amount: params.amountIn
        }));
    const quoteResponse = await postTradingApi("/quote", buildTradingQuoteRequest(params));
    const swapResponse = await postTradingApi("/swap", prepareTradingSwapRequest(quoteResponse));
    validateTradingSwapResponse(swapResponse);
    return {
        routing: String(quoteResponse.routing ?? "CLASSIC"),
        approval: approval?.approval ?? null,
        quoteResponse,
        swap: swapResponse.swap
    };
}
async function fetchDexScreenerPairs(tokenAddress) {
    const key = normalizeAddress(tokenAddress);
    const cached = dexscreenerTokenCache.get(key);
    if (cached) {
        return cached;
    }
    const promise = (async () => {
        const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/xlayer/${normalizeAddress(tokenAddress)}`);
        if (!response.ok) {
            throw new Error(`DexScreener returned ${response.status}`);
        }
        return (await response.json());
    })();
    dexscreenerTokenCache.set(key, promise);
    return promise;
}
function selectDexScreenerPair(pairs, poolAddress, token0, token1) {
    const normalizedPool = normalizeAddress(poolAddress);
    const token0Address = normalizeAddress(token0.address);
    const token1Address = normalizeAddress(token1.address);
    return pairs.find((pair) => {
        const baseAddress = normalizeAddress(pair.baseToken?.address ?? "");
        const quoteAddress = normalizeAddress(pair.quoteToken?.address ?? "");
        return (normalizeAddress(pair.pairAddress ?? "") === normalizedPool ||
            (baseAddress === token0Address && quoteAddress === token1Address) ||
            (baseAddress === token1Address && quoteAddress === token0Address));
    });
}
async function getDefiLlamaPools() {
    if (!defillamaPoolsPromise) {
        defillamaPoolsPromise = (async () => {
            const response = await fetch("https://yields.llama.fi/pools");
            if (!response.ok) {
                throw new Error(`DefiLlama returned ${response.status}`);
            }
            const json = (await response.json());
            return json.data ?? [];
        })();
    }
    return defillamaPoolsPromise;
}
function selectDefiLlamaPool(token0, token1, pools) {
    const left = token0.symbol.toUpperCase();
    const right = token1.symbol.toUpperCase();
    return pools.find((pool) => {
        const project = String(pool.project ?? "").toLowerCase();
        const chain = String(pool.chain ?? "").toLowerCase().replace(/\s+/gu, "");
        const symbol = String(pool.symbol ?? "").toUpperCase();
        return (project.includes("uniswap") &&
            chain === "xlayer" &&
            symbol.includes(left) &&
            symbol.includes(right));
    });
}
export async function fetchOfficialPoolAnalytics(params) {
    const sourceLabels = ["Official Uniswap liquidity-planner pair and range conventions"];
    const warnings = [];
    let dexScreenerPair;
    try {
        const [leftPairs, rightPairs] = await Promise.all([
            fetchDexScreenerPairs(params.token0.address),
            fetchDexScreenerPairs(params.token1.address)
        ]);
        dexScreenerPair = selectDexScreenerPair([...leftPairs, ...rightPairs], params.poolAddress, params.token0, params.token1);
        if (dexScreenerPair) {
            sourceLabels.push("DexScreener liquidity and volume");
        }
        else {
            warnings.push("DexScreener returned no matching X Layer pair analytics for this pool.");
        }
    }
    catch (error) {
        warnings.push(`DexScreener lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let defillamaPool;
    try {
        defillamaPool = selectDefiLlamaPool(params.token0, params.token1, await getDefiLlamaPools());
        if (defillamaPool) {
            sourceLabels.push("DefiLlama APY and TVL");
        }
        else {
            warnings.push("DefiLlama returned no X Layer Uniswap pool row for this pair.");
        }
    }
    catch (error) {
        warnings.push(`DefiLlama lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return {
        sourceLabels,
        warnings,
        dexScreenerLiquidityUsd: typeof dexScreenerPair?.liquidity?.usd === "number" ? dexScreenerPair.liquidity.usd : undefined,
        dexScreenerVolume24hUsd: typeof dexScreenerPair?.volume?.h24 === "number" ? dexScreenerPair.volume.h24 : undefined,
        dexScreenerUrl: dexScreenerPair?.url,
        defillamaApyPct: typeof defillamaPool?.apy === "number" ? defillamaPool.apy : undefined,
        defillamaTvlUsd: typeof defillamaPool?.tvlUsd === "number" ? defillamaPool.tvlUsd : undefined,
        defillamaVolume24hUsd: typeof defillamaPool?.volumeUsd1d === "number" ? defillamaPool.volumeUsd1d : undefined
    };
}
