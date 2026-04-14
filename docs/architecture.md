# Architecture

## Goal

`Uniswap LP Intent Compiler` turns natural-language LP intent into reusable X Layer Uniswap LP workflows.

## Core Layers

### 1. Official Uniswap Conventions

- `liquidity-planner` provides pair archetype, fee-tier, and range-planning conventions
- `swap-integration` provides Trading API request-shaping and swap-routing conventions

### 2. Project Runtime

The local runtime lives in `skills/uniswap-lp-intent-compiler/` and adds:

- live Uniswap v3 pool discovery on X Layer
- candidate ranking
- LP plan generation
- inventory planning and pre-swap handling
- Agentic Wallet execution
- monitoring, reposition suggestion, and close flows

### 3. Safety Layer

- preflight checks before execution
- exact approvals only
- tx-scan guardrails before state-changing calls
- explicit confirmation before wrap, approve, swap, mint, decrease-liquidity, or collect

## Flow

1. Natural-language request
2. Preflight
3. Candidate discovery or direct pair selection
4. LP planning
5. Optional pre-swap
6. LP mint
7. Monitor
8. Reposition suggestion
9. Close plan and close execution

## Adapter Strategy

- Codex: `skills/uniswap-lp-intent-compiler/`
- Claude Code: `CLAUDE.md`, `.claude/skills/`, `.claude/agents/`, optional `.claude/commands/`
- OpenClaw-style SKILL.md loaders: reuse the Codex-compatible skill package with minimal wrapping

The runtime is maintained once. Adapter layers stay thin and only explain how each agent should invoke the same local workflows.
