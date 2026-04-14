---
description: Build and execute a safe LP close flow with explicit confirmation.
disable-model-invocation: true
---

Prepare a close flow for this LP NFT:

$ARGUMENTS

Workflow:

1. Show the close plan first with:
   `npm run lp -- close --token-id $ARGUMENTS`
2. Explain the expected remove-liquidity and collect steps.
3. Require explicit user confirmation before any state-changing action.
4. Only then run the confirmed close path.

Never close an LP silently.
