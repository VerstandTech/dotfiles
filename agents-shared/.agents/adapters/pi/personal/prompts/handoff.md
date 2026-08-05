---
description: Produce BDD/TDD handoff evidence (red/green/acceptance/mutation)
argument-hint: "[optional-notes]"
---

Produce the final **BDD/TDD handoff** for this work. ${1:-}

1. `/bdd verify` if not already there.
2. Call `bdd_handoff` and fill any missing fields via `bdd_record_evidence`.
3. Ensure:
   - Red command + failing reason
   - Green command + pass result
   - Acceptance path **or** N/A + reason
   - Mutation/sensitivity note when acceptance changed
   - CRAP mitigation for new branches/error paths
4. Paste the evidence block in the reply (and issue/PR if applicable).
