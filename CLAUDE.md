# Uniswap LP Intent Compiler

Project-level Claude Code guidance for this repository.

## Primary Claude Assets

- Project memory: `CLAUDE.md`
- Project skill: `.claude/skills/uniswap-lp-intent-compiler/SKILL.md`
- Project subagent: `.claude/agents/uniswap-lp-orchestrator.md`
- Supporting docs:
  - `docs/architecture.md`
  - `docs/demo-script.md`
  - `docs/proof-of-transactions.md`

## When To Use This Project Skill

Use the project LP skill when the user asks to:

- discover or rank X Layer LP candidates
- build an LP plan from natural language
- open a Uniswap v3-style LP on X Layer
- monitor an LP NFT
- suggest a reposition without broadcasting
- close or cancel an LP safely

## Workflow Rules

1. Run `npm run lp -- preflight` before any state-changing LP workflow.
2. If preflight fails, stop and explain remediation instead of guessing.
3. Never silently switch chain or pair after the user has chosen one.
4. Never use unlimited approvals.
5. Before wrap, approve, swap, mint, `decreaseLiquidity`, or `collect`:
   - summarize the action
   - require explicit user confirmation
   - run the tx-scan guardrails used by the project
6. Stop on tx-scan `block`.
7. Require extra confirmation on tx-scan `warn`.
8. Prefer natural-language summaries first, then show machine-readable outputs when useful.
9. Use `npm run test` after code changes when relevant.

## Capability Map

- `discover`: LP candidate search and ranking on X Layer
- `plan`: structured LP plan from natural language
- `open`: inventory planning, swap routing, approvals, and mint
- `monitor`: LP NFT health and in-range status
- `reposition-suggest`: updated range suggestion without broadcast
- `close`: remove liquidity and collect with explicit confirmation
