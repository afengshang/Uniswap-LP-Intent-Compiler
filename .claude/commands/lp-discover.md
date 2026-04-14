---
description: Discover and rank X Layer LP candidates with the project LP runtime.
disable-model-invocation: true
---

Run the LP discovery flow from the repository root.

If the user supplied custom focus, include it in the planning intent. Otherwise default to:

`Find low-risk but decent-yield LPs on X Layer`

Use:

`npm run lp -- plan --intent "..."`

Return:

- ranked LP candidates
- selected pool if the runtime chooses one
- why the top candidates scored well
- the safest next action

Additional user context:

$ARGUMENTS
