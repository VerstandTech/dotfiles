---
description: Dispatch N UX personas against a flow or UI surface
argument-hint: "<count> <flow-or-path>"
---

Dispatch a **UX persona fleet** for:

$@

1. Load `agentic-fleet`.
2. Parse count (default **3**) and the flow/path/screen. Prefer small fleets unless the user asks for more.
3. `fleet_dispatch` kind=`ux` with clear scope (routes, components, copy).
4. Synthesize persona reactions into a prioritized UX punch list (friction → opportunity → quick wins).
