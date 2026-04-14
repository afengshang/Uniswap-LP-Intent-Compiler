# Official Skill Proof Map

This project is intentionally positioned as an **orchestrator on top of official Uniswap AI Skills**, not as a standalone Uniswap-themed script.

## Official Skill Dependencies

### 1. `liquidity-planner`

Path:

- `$CODEX_HOME/skills/uniswap/liquidity-planner/SKILL.md`

Responsibilities reused by this project:

- LP intent collection and normalization
- pair and fee-tier framing
- archetype-based range conventions
- analytics conventions from DexScreener and DefiLlama
- LP-specific warnings around range management and liquidity depth

Primary source sections:

- `Workflow` step 3: discover available pools
- `Workflow` step 4: assess pool liquidity
- `Workflow` step 5: fetch pool metrics
- `Workflow` step 6: suggest price ranges
- `Workflow` step 7: determine fee tier
- `references/position-types.md`: fee tiers, tick spacing, position archetypes

### 2. `swap-integration`

Path:

- `$CODEX_HOME/skills/uniswap/swap-integration/SKILL.md`

Responsibilities reused by this project:

- Trading API 3-step flow
- approval request construction
- quote request construction
- swap request body shaping
- null-field stripping and request validation
- Trading API retry and error handling

Primary source sections:

- `Trading API (Recommended)` overview
- `Trading API Reference`
- `Critical Implementation Notes`
- `Rate Limiting`

## Orchestrator Split

### Official skills provide

- planning conventions
- data-provider conventions
- Trading API request and validation patterns

### `uniswap-lp-intent-compiler` adds

- live X Layer Uniswap v3 candidate discovery from the canonical factory
- X Layer-specific risk ranking
- Agentic Wallet execution and `tx-scan`
- wrap, approval, mint, monitor, and reposition orchestration
- prize-mode preflight and proof outputs
