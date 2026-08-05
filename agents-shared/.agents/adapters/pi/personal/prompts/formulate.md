---
description: Formulate Gherkin/acceptance scenarios from the Example Map (no implementation)
argument-hint: "[issue-or-focus]"
---

Enter **formulation** for: ${1:-the current Example Map}

1. Load `bdd-tdd` skill; `bdd_status` first.
2. `/bdd formulation`.
3. Trace each scenario to a mapped example id.
4. If the repo has Gherkin (`*.feature`, `gherkin:*` scripts, `docs/bdd/gherkin-conventions.md`), follow those conventions exactly.
5. Otherwise write acceptance-level tests in the project’s existing harness and comment the example ids.
6. You may add failing unit/integration skeletons; **no production implementation**.
7. Summarize scenarios added and move to `/bdd red` when ready to prove failure.
