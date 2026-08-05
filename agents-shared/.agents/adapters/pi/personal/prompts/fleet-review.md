---
description: Dispatch N adversarial code-review personas
argument-hint: "<count> <scope-or-diff>"
---

Dispatch a **code-review fleet** for:

$@

1. Load `agentic-fleet`.
2. Parse count (default **3**) and scope (diff/PR/paths). Prefer small fleets unless the user asks for more.
3. `fleet_dispatch` kind=`review` with scope set so every child inspects the real diff/files.
4. Children must stay read-only (`fleet-reviewer`).
5. After completion, synthesize: blockers worth fixing now, optional nits, what to ignore — then ask before applying fixes unless I already said autofix.
