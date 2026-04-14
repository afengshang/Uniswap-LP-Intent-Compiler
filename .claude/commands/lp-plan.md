---
description: Build a structured LP plan for a selected pair or intent.
disable-model-invocation: true
---

Build an LP plan for this request:

$ARGUMENTS

Run from the repository root:

`npm run lp -- plan --intent "$ARGUMENTS"`

Return:

- pair and chain
- selected pool and fee tier
- pair archetype
- range
- target token mix
- swap planning mode
- warnings or confirmation blockers
