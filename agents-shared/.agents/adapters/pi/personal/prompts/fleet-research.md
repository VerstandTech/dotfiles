---
description: Dispatch N research sub-agents with distinct angles
argument-hint: "<count> <topic>"
---

Dispatch a **research fleet** for:

$@

1. Load skill `agentic-fleet` if needed.
2. Parse count (default **5** if missing) and topic from the args. Prefer small fleets unless the user asks for more.
3. Call `fleet_dispatch` with kind=`research`, that count, and topic.
4. Optional: pass models from `~/.pi/agent/fleet.json` or rotate strong/fast models.
5. Tell me how to watch progress (`/subagents-fleet`).
6. When results return, synthesize: what we know, conflicts, recommended decision, gaps.
