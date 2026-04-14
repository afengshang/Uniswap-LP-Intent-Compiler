# Demo Script

## 30-Second Version

`Uniswap LP Intent Compiler` is a reusable X Layer LP agent skill built on top of official Uniswap AI Skills. It does more than swap routing: it discovers live LP candidates, compiles a range-aware LP plan, executes through Agentic Wallet with tx-scan guardrails, then monitors, suggests repositioning, and supports close flows. We already proved the full LP lifecycle on X Layer with real mint and real close transactions.

## 90-Second Version

1. Start with preflight.
   - Show that official Uniswap skills are installed.
   - Show that Agentic Wallet, OKX credentials, and `UNISWAP_API_KEY` are ready.
2. Ask for lower-risk LP ideas on X Layer.
   - Show candidate ranking and the selected pool.
3. Build the LP plan.
   - Highlight pair archetype, fee tier, range, and swap mode.
4. Open the LP.
   - Emphasize user confirmation, exact approvals, and tx-scan guardrails.
5. Monitor the live LP NFT.
   - Show in-range status.
6. Run reposition suggestion.
   - Show that it remains advisory in v1.
7. Show the close proof.
   - Present `decreaseLiquidity` and `collect` transaction hashes as evidence of full lifecycle completion.

## Judge-Facing One-Liner

This is not another AI swap bot. It is a reusable Uniswap LP orchestration skill that composes official Uniswap planning and routing conventions with real X Layer execution, monitoring, and close flows.
