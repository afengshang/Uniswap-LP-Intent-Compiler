---
name: uniswap-lp-intent-compiler
description: Discover, plan, open, monitor, reposition, and close Uniswap v3-style LP positions on X Layer using official Uniswap conventions plus Agentic Wallet guardrails. Also trigger on short natural-language requests like "我想组LP", "帮我做LP", "帮我加池子", and "我想做流动性".
---

# Uniswap LP Intent Compiler

Use this project skill when the request is about reusable Uniswap LP workflows on X Layer.

Also use it for short natural-language asks such as:

- "我想组LP"
- "帮我做LP"
- "帮我加池子"
- "我想做流动性"
- "帮我找个适合的 LP 池子"
- "先帮我看看 X Layer 上有什么 LP 可以做"

The current request or focus area is:

$ARGUMENTS

## Supporting Files

- For workflow rules and repo commands, see [reference.md](reference.md)
- For prompts and expected invocation patterns, see [examples.md](examples.md)
- For repository-wide behavior, also respect `CLAUDE.md`

## Primary Behaviors

- run preflight and explain readiness
- discover and rank X Layer LP candidates
- build a structured LP plan for a selected pair
- open an LP with Agentic Wallet guardrails
- monitor an existing LP NFT
- generate a reposition suggestion without auto-broadcast
- generate a safe close plan and only proceed after explicit confirmation

## Core Rules

1. Start with `npm run lp -- preflight` before any state-changing LP workflow.
2. If preflight fails, stop and explain remediation instead of improvising.
3. Never silently switch chain or selected pair.
4. Never use unlimited approvals.
5. Require explicit user confirmation before any wrap, approve, swap, mint, `decreaseLiquidity`, or `collect`.
6. Respect the project's tx-scan guardrails for every state-changing action.
7. Stop on tx-scan `block`.
8. On tx-scan `warn`, ask for explicit confirmation before continuing.
9. Treat `reposition-suggest` as analysis only in this version; do not auto-broadcast reposition transactions.

## Common Commands

Run from the repository root:

```bash
npm run lp -- preflight
npm run lp -- plan --intent "Find low-risk but decent-yield LPs on X Layer"
npm run lp -- open --intent "Open a balanced WOKB/USDC LP on X Layer with $2" --confirm
npm run lp -- monitor --token-id 155
npm run lp -- reposition-suggest --token-id 155
npm run lp -- close --token-id 155
```
