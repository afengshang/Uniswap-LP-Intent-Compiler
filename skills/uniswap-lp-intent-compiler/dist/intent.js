import { z } from "zod";
const pairRegex = /([A-Z0-9_]{2,})\s*\/\s*([A-Z0-9_]{2,})/i;
const poolRegex = /\b0x[a-fA-F0-9]{40}\b/;
const explicitDollarAmountRegex = /(?:^|[\s(])\$(\d+(?:\.\d+)?)(?=$|[\s),.])/gi;
const qualifiedAmountRegex = /(?:with|using|for|budget(?:ed)?(?:\s+at)?)\s+\$?(\d+(?:\.\d+)?)(?:\s*(usd|usdc|usdt))?(?=$|[\s),.])/gi;
const fiatAmountRegex = /(?:^|[\s(])(\d+(?:\.\d+)?)\s*(usd|usdc|usdt)(?=$|[\s),.])/gi;
const amountSchema = z.number().positive().finite();
function detectRiskProfile(text) {
    const lower = text.toLowerCase();
    if (/(safe|low risk|稳健|保守|conservative)/i.test(lower)) {
        return "conservative";
    }
    if (/(aggressive|high risk|激进|高收益)/i.test(lower)) {
        return "aggressive";
    }
    return "balanced";
}
function detectPreference(text) {
    const lower = text.toLowerCase();
    if (/(stable|稳定|low risk|保守|稳)/i.test(lower)) {
        return "stable";
    }
    if (/(bluechip|eth|okb|weth|wokb|主流)/i.test(lower)) {
        return "bluechip";
    }
    return "balanced";
}
function detectDepositUsd(text) {
    const explicitDollarMatches = [...text.matchAll(explicitDollarAmountRegex)];
    const qualifiedMatches = [...text.matchAll(qualifiedAmountRegex)];
    const fiatMatches = [...text.matchAll(fiatAmountRegex)];
    const match = explicitDollarMatches.at(-1)?.[1] ??
        qualifiedMatches.at(-1)?.[1] ??
        fiatMatches.at(-1)?.[1];
    if (!match) {
        return 100;
    }
    const parsed = Number(match);
    return amountSchema.parse(parsed);
}
function detectPairHint(text) {
    const match = text.match(pairRegex);
    if (!match) {
        return undefined;
    }
    return `${match[1].toUpperCase()}/${match[2].toUpperCase()}`;
}
function detectPoolHint(text) {
    const match = text.match(poolRegex);
    return match?.[0]?.toLowerCase();
}
export function parseIntent(raw) {
    const normalized = raw.replace(/₮/gu, "T");
    return {
        raw,
        chain: "xlayer",
        depositUsd: detectDepositUsd(normalized),
        riskProfile: detectRiskProfile(normalized),
        pairHint: detectPairHint(normalized),
        poolAddressHint: detectPoolHint(normalized),
        preference: detectPreference(normalized)
    };
}
