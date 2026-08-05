---
description: Start BDD discovery — Example Map before scenarios or code
argument-hint: "[issue-or-focus]"
---

Enable BDD mode and run **discovery only** for: ${1:-the current task}

1. Load the `bdd-tdd` skill.
2. `/bdd discovery` (or `bdd_set_phase` phase=discovery).
3. Build an Example Map: **Rules (R#)**, **Examples (R#-E#)** with concrete values, **Questions (Q#)**.
4. Prefer writing the map on the tracking issue; otherwise a short doc under `docs/` if the repo uses that.
5. Call `bdd_record_evidence` with exampleMapRef and counts.
6. Do **not** write production code or tests yet.
7. When examples are solid, stop and summarize the map; ask before `/bdd formulation`.
