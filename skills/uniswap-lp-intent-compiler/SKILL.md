---
name: uniswap-lp-intent-compiler
description: Build and operate reusable Uniswap LP workflows on X Layer by orchestrating official Uniswap AI Skills plus Agentic Wallet execution. Use when the user asks to find LP candidates, rank low-risk/high-yield liquidity pools, choose a pair for LP, open a Uniswap v3-style LP position on X Layer, monitor an LP position, close/remove/cancel an LP position, suggest a reposition plan, or uses natural-language requests such as "我想组LP", "帮我加池子", "我想做LP", "帮我做流动性", or "帮我找一个适合的LP池子" with official liquidity-planner conventions, swap-integration routing, and OnchainOS guardrails.
---

# Uniswap LP Intent Compiler

Turn natural-language LP intent into a prize-ready X Layer LP workflow built on top of official Uniswap AI Skills.

This skill is natural-language first. The local CLI is only a demo and validation harness for the same orchestration logic.

## Trigger Surface

This skill should be invoked not only for explicit technical LP requests, but also for short natural-language prompts such as:

- "我想组LP"
- "帮我做LP"
- "帮我加池子"
- "我想做流动性"
- "帮我找一个合适的 LP 池子"
- "帮我看看现在适合做哪个 LP"
- "我想在 X Layer 上做 LP"
- "帮我先规划一下 LP 再决定要不要开仓"

When the request is this short or informal:

1. treat it as an LP workflow request
2. run `preflight` first
3. discover and rank candidates if the pair is not specified
4. return the LP plan before any state-changing action

## Hard Prerequisites

- Official skill: `$CODEX_HOME/skills/uniswap/liquidity-planner/SKILL.md`
- Official skill: `$CODEX_HOME/skills/uniswap/swap-integration/SKILL.md`
- this skill directory installed at `$CODEX_HOME/skills/uniswap-lp-intent-compiler/`
- skill-local Node dependencies installed once with `npm install` inside this skill directory
- `onchainos` CLI installed
- Agentic Wallet logged in
- workspace `.env` containing `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`
- `UNISWAP_API_KEY` for prize-mode official swap routing

If any prerequisite is missing, run the local `preflight` flow first and stop with remediation instead of silently degrading.

Packaging note:

- Copy the skill root itself into `$CODEX_HOME/skills/uniswap-lp-intent-compiler/`.
- Keep `package.json`, `scripts/`, `references/`, `agents/`, and `SKILL.md`.
- `dist/` may be rebuilt on first run, so it is optional.
- `node_modules/` should not be copied from another workspace; install it fresh in the skill directory.

## Responsibility Split

### `liquidity-planner`

Use it for:

- LP intent normalization
- pair archetype conventions
- fee-tier guidance
- range-width guidance
- DexScreener and DefiLlama analytics conventions

### `swap-integration`

Use it for:

- Trading API `check_approval -> quote -> swap` flow
- request shaping
- null-field stripping
- retry and validation behavior
- confirmation and broadcast safety expectations

### `uniswap-lp-intent-compiler`

Add the X Layer-specific orchestration layer:

- discover live Uniswap v3 pools on X Layer from the canonical factory
- rank pools with X Layer onchain activity plus official analytics
- choose a candidate pool before execution
- plan inventory and pre-swap requirements
- route execution through Agentic Wallet and `onchainos security tx-scan`
- open the LP, then support `monitor`, `reposition-suggest`, and safe LP close flows

## Workflow

1. Read and apply the official `liquidity-planner` conventions for pair archetypes, fee guidance, and range guidance.
2. Read and apply the official `swap-integration` conventions for Trading API request construction and validation.
3. Run preflight:
   - official skills installed
   - OnchainOS available
   - Agentic Wallet ready
   - OKX env present
   - `UNISWAP_API_KEY` present for `official-skills-hybrid`
   - capability prompt menu returned for the next natural-language action
4. Discover live X Layer Uniswap v3 pools by probing the canonical factory with `getPool()`.
5. Enrich each candidate with:
   - token metadata from OnchainOS
   - live pool price and tick state
   - recent swap activity from bounded log scans
   - DexScreener liquidity and volume when available
   - DefiLlama APY and TVL when available
   - official pair archetype and fee guidance
6. If the user has not selected a pair yet:
   - return ranked candidates first
   - ask them to choose a pool or pair
   - do not open a position yet
7. Build an LP plan with:
   - selected pool
   - pair archetype
   - fee tier and provenance
   - official-skill-aligned range
   - target token mix
   - swap planning mode
   - funding actions
8. Before any state-changing step:
   - summarize the action
   - require explicit confirmation
   - run `onchainos security tx-scan`
   - stop on `block`
   - stop and request extra confirmation on `warn`
9. For pre-swap:
   - default to `official-skills-hybrid` when `UNISWAP_API_KEY` exists
   - use Uniswap Trading API via official `swap-integration` patterns
   - fall back to OnchainOS DEX only when the API key is missing, routing fails, or fallback is explicitly requested
10. Keep LP execution direct on X Layer:
   - wrap native OKB into WOKB when needed
   - exact approvals only
   - mint via the live Uniswap v3 Position Manager
11. After open:
   - support `monitor`
   - support `reposition-suggest`
   - support `close` as an explicit remove-liquidity and collect flow
   - do not auto-broadcast reposition transactions in v1
   - do not auto-burn closed LP NFTs in v1

## Execution Rules

- Never silently switch chain.
- Never silently switch the chosen pool once the user has selected it.
- Never use unlimited approvals.
- Never skip `tx-scan` for any approval, wrap, swap, or LP contract call.
- Never close/remove/cancel an LP without explicit `--confirm`.
- If no live Uniswap pool exists for the chosen pair on X Layer, stop and ask the user to choose another pair.
- If `UNISWAP_API_KEY` is missing, label the mode as `fallback-onchainos` in the output.
- After preflight succeeds, show the user the returned `capabilityPrompts` list so they can choose the next action in natural language.

## Local Entry Points

Run from the workspace root:

```bash
npm run lp -- preflight
npm run lp -- plan --intent "Find low-risk but decent-yield LPs on X Layer"
npm run lp -- open --intent 'Open a balanced WOKB/USDC LP on X Layer with $25' --confirm
npm run lp -- close --token-id 155
```

## References

- Official proof map: see [references/official-skill-proof-map.md](references/official-skill-proof-map.md)
- Deployment facts: see [references/deployment-notes.md](references/deployment-notes.md)
- Ranking model: see [references/ranking-model.md](references/ranking-model.md)
