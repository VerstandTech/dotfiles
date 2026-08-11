# SEC-00 Independent Review Contracts

**Candidate:** integration branch at/after `50864eb`; read-only reviews bind to the observed clean source SHA after transient boards are excluded.

## Reviewer A — Security breaker

- **Objective:** adversarially attack SEC-00's actual mechanical boundary, not prompt prose.
- **Read scope:** SEC-00 map/feature/tests; `lib/fleet/child-policy.ts`; three fleet agent definitions; `plan.ts`; `agentic-fleet.ts`; installed Pi and pi-subagents 0.45.2 source relevant to tools/extensions/env/permissions/RPC.
- **Forbidden:** all writes, tests changes, production changes, installs, RPC spawn, fleet dispatch, network, merge/push/cleanup/delegation.
- **Required attacks:** path lexical/realpath/symlink/alias bypasses; every read-like input shape; exact-vs-denylist tool drift; project/user agent shadowing; ambient extension loading; environment allowlist and pre-start injection gaps; auth/search credential exposure; audit traversal/leak/unbounded records; preflight bypass/fallback and topic leakage; runtime acknowledgement ordering.
- **Report:** P0/P1/P2 with exploit fixture and exact path:line; distinguish SEC-00 blocker from SEC-01 residual. End `SEC00 SECURITY REVIEW COMPLETE` and GO/BLOCKED.

## Reviewer B — Correctness and simplicity

- **Objective:** verify behavior against pi-subagents/Pi runtime contracts and identify unnecessary complexity, false assurance, brittle tests, and regressions.
- **Read scope:** same candidate plus existing CMP-02/fleet tests and package metadata.
- **Forbidden:** same read-only limits.
- **Required checks:** public 0.45.2 payload compatibility; explicit extensions disabling ambient; frontmatter parsing; permission audit activation; runtime tool event shapes; sanitizer lifecycle; model/search viability; exact canonical agent contract; blocked result distinction; 948-line policy maintainability/CRAP; false-positive/false-negative fixtures; source-text-test brittleness.
- **Report:** P0/P1/P2 with exact fixes/tests; no generic praise. End `SEC00 CORRECTNESS REVIEW COMPLETE` and GO/BLOCKED.

Both reviewers use `xai/grok-4.5`, high thinking, a 300000 ms wall budget, no follow-up unless the parent asks one focused question, and no subagents/fleets.
