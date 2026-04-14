---
description: Generate a reposition suggestion without broadcasting transactions.
disable-model-invocation: true
---

Generate a reposition suggestion for this LP NFT:

$ARGUMENTS

Run from the repository root:

`npm run lp -- reposition-suggest --token-id $ARGUMENTS`

Return:

- current range
- proposed new range
- token mix notes
- why the reposition is suggested

Do not auto-broadcast reposition transactions.
