# Ranking Model

Candidate pools are ranked with a hybrid model: official Uniswap skill conventions plus live X Layer pool and token data.

## Official Inputs

From `liquidity-planner` conventions:

- pair archetype classification
- recommended fee tier by archetype
- range-width guidance by archetype and risk profile
- analytics-provider conventions for DexScreener and DefiLlama

From `swap-integration` conventions:

- prize-mode preference for Uniswap Trading API swap planning
- explicit routing/fallback labeling

## Live X Layer Inputs

- pool fee tier
- pool liquidity state from the live Uniswap v3 pool
- recent swap activity count from live pool logs sampled over a bounded block window
- token metadata from OnchainOS token search
- token price and hourly candles from OnchainOS market APIs
- DexScreener liquidity and volume when available
- DefiLlama APY and TVL when available

## Yield Proxies

- more recent swaps improve activity score
- higher live or analytics-derived liquidity improves execution confidence
- fee tiers that match official archetype guidance score better
- external volume and APY proxies lift the yield score when available

## Risk Proxies

- higher hourly realized volatility increases risk
- large 24h token moves increase risk
- unrecognized tokens are penalized heavily
- very thin or inactive pools are penalized heavily
- fee tiers that mismatch the official archetype guidance receive a penalty

## Output

Each candidate exposes:

- `yieldScore`
- `riskScore`
- `overallScore`
- `pairArchetype`
- `analyticsSources`
- `warnings`
- `reasoning`

This keeps the shortlist explainable for both users and judges before any LP execution step begins.
