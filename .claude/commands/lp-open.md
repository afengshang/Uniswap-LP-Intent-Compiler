---
description: Open an LP position with confirmation and safety checks.
disable-model-invocation: true
---

Prepare to open an LP position for this request:

$ARGUMENTS

Workflow:

1. Run preflight if it has not already been run in this session.
2. Build or confirm the LP plan.
3. Summarize approvals, swaps, and mint actions.
4. Require explicit user confirmation before any state-changing action.
5. Only then run:

`npm run lp -- open --intent "$ARGUMENTS" --confirm`

Stop if preflight or safety checks are not ready.
