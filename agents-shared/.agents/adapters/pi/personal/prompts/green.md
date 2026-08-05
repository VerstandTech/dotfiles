---
description: Minimum implementation to pass recorded red tests
argument-hint: "[optional-notes]"
---

Enter **green** and implement the minimum fix. ${1:-}

1. `bdd_status` — require existing red evidence; if missing, go back to `/tdd`.
2. `/bdd green`.
3. Implement only what the failing tests demand — no scope creep.
4. `bdd_assert_green` on the same focus, then broader suite if needed.
5. If user-visible, run acceptance command from config / `bdd_status`.
6. Propose `/bdd verify` + `/handoff` when green is recorded.
