# X Layer Deployment Notes

The current build is anchored to the live X Layer environment and packaged as a skill-local runtime under `skills/uniswap-lp-intent-compiler/`.

## Chain

- Chain: `X Layer`
- Chain ID: `196`
- Default RPC: `https://rpc.xlayer.tech`

## Canonical Uniswap v3 Contracts Detected On-Chain

- Factory: `0xcb2436774C3e191c85056d248EF4260ce5f27A9D`
- Nonfungible Position Manager: `0x743E03cceB4af2efA3CC76838f6E8B50B63F184c`
- Quoter V2: `0x5911cB3633e764939edc2d92b7e1ad375Bb57649`
- Swap Router 02: `0xaa52bB8110fE38D0d2d2AF0B85C3A3eE622CA455`
- Tick Lens: `0xB3309C48F8407651D918ca3Da4C45DE40109E641`
- Multicall2: `0x5d6b0f5335ec95cD2aB7E52f2A0750dd86502435`

## Prize-Mode Runtime Facts

- The runtime is packaged inside the skill folder, not only at the repo root.
- Preflight explicitly verifies:
  - official `liquidity-planner`
  - official `swap-integration`
  - `onchainos`
  - Agentic Wallet readiness
  - OKX env vars
  - `UNISWAP_API_KEY`
- Swap routing mode is explicit:
  - `official-skills-hybrid` when `UNISWAP_API_KEY` exists
  - `fallback-onchainos` otherwise

## Discovery Strategy

The implementation no longer assumes `WETH/USDC` or any single pair exists as a live LP candidate on X Layer.

Instead, it:

1. builds a candidate token universe from OnchainOS token search
2. probes the canonical Uniswap v3 factory with `getPool()`
3. enriches the discovered pools with live pool reads and official analytics
4. ranks the live candidates
5. lets the user choose a pair
6. only then compiles and opens the LP

## RPC Constraint Handling

X Layer RPC rejected wide `eth_getLogs` scans during development, so the implementation uses:

- direct `getPool()` probing instead of full historical factory-log discovery
- bounded chunked pool-log scans for recent swap activity sampling

## Execution Boundary

- Pre-swap is routed through Uniswap Trading API patterns when prize mode is active.
- LP creation is still direct `v3-style` mint execution on X Layer via Agentic Wallet.
- LP close executes `decreaseLiquidity` and `collect` only after explicit confirmation.
- Reposition remains suggestion-only in v1.
- LP NFT burn is intentionally not automated in v1.
