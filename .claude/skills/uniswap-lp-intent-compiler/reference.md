# Reference

## Repository Runtime

- Core reusable runtime: `skills/uniswap-lp-intent-compiler/`
- Codex/OpenClaw-compatible package:
  - `skills/uniswap-lp-intent-compiler/SKILL.md`
  - `skills/uniswap-lp-intent-compiler/agents/openai.yaml`
  - `skills/uniswap-lp-intent-compiler/scripts/`
  - `skills/uniswap-lp-intent-compiler/references/`
  - `skills/uniswap-lp-intent-compiler/dist/`

## Preferred Command Flow

1. `npm run lp -- preflight`
2. `npm run lp -- plan --intent "..."`
3. `npm run lp -- open --intent "..." --confirm`
4. `npm run lp -- monitor --token-id <id>`
5. `npm run lp -- reposition-suggest --token-id <id>`
6. `npm run lp -- close --token-id <id>`

## Guardrails

- Do not proceed with state changes when preflight is not ready.
- Do not silently replace the pair or chain.
- Always require explicit confirmation before state-changing actions.
- Respect the project tx-scan workflow for approvals, swaps, and LP calls.
- Treat close as a two-step remove-and-collect process.

## Public Demo Story

- official `liquidity-planner` provides LP planning conventions
- official `swap-integration` provides Trading API routing conventions
- the project runtime adds X Layer discovery, ranking, wallet execution, monitoring, and close flows
- the MVP already proved full open and close lifecycle on X Layer
