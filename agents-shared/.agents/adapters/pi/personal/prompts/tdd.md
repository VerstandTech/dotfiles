---
description: Enter red phase — write failing tests and record bdd_assert_red
argument-hint: "[focus-or-test-path]"
---

Run **TDD red** for: ${1:-the current behavior}

1. Load `bdd-tdd`; ensure an Example Map exists for behavior changes (or record why not).
2. `/bdd red` with focus set.
3. Write/update failing tests only (unit/integration/acceptance as appropriate).
4. Call `bdd_assert_red` (use `append` for a focused path when useful).
5. Confirm the failure is the **right** reason.
6. Do not edit implementation paths until red evidence is recorded and phase moves to green.
