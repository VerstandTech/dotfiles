# Example Map — High-Assurance WezTerm → Herdr → Pi Workflow

**Focus:** `pi-herdr-wezterm-high-assurance`
**Actor:** developer-orchestrator maintaining synchronized dotfiles across macOS and Ubuntu
**Goal:** make high-assurance multi-agent delivery reproducible, observable, isolated, test-first, and safe without duplicating controls already present in the Pi personal package
**Scope:** implementation plan only; production implementation is a later, separately approved delivery cycle

## Rules

### R1 — Preserve clear layer ownership

WezTerm is host chrome and launch/attach UX; Herdr is the durable PTY, workspace, pane, worktree, agent-state, and notification runtime; Pi is the policy, role, tool, test, and coding layer.

- **R1-E1:** Closing or detaching WezTerm does not terminate Herdr-owned agents.
- **R1-E2:** WezTerm does not reimplement Herdr workspaces or agent lifecycle state.
- **R1-E3:** Pi consumes Herdr IDs and JSON envelopes rather than deriving state from sidebar position.

### R2 — Compose existing Pi controls before creating new ones

The plan extends the existing `bdd-mode`, `agentic-fleet`, `worktree-board`, `herd`, CAID, trajectory, decision-store, cost-budget, and role-agent surfaces. It does not create a second phase engine or a merged mega-extension.

- **R2-E1:** A new orchestrator is a thin façade over pure libraries and existing tools, not an LLM-owned control loop.
- **R2-E2:** Existing scaffolding is labeled `enforced`, `opt-in`, `scaffold`, or `roadmap` accurately.

### R3 — Rules have one canonical authoring path

Always-on workflow rules are authored through `rulesync.jsonc` and `.rulesync/**`; generated files such as `AGENTS.md`, `.cursor/**`, and `.codex/**` are never hand-edited. Pi-specific executable behavior remains in the Pi personal package; portable skills remain in `agents-shared/.agents/skills/`.

- **R3-E1:** The initial governance package resolves that Rulesync files are currently absent from this checkout before any generated-rule change.
- **R3-E2:** Rulesync generation has a deterministic check that fails on drift.
- **R3-E3:** `agents-shared` remains the resource source of truth while Rulesync is the rule-generation source of truth.

### R4 — Reproducible base runtime precedes orchestration work

The installer and stow packages reproduce Herdr configuration, the Pi lifecycle integration, compatible versions, and a documented WezTerm attach path on supported machines.

- **R4-E1:** Live baseline detects Herdr 0.8.0 protocol 19 and reports that the Pi integration is missing.
- **R4-E2:** A fresh install either installs the supported Herdr binary or fails with an exact manual step; it never silently claims success.
- **R4-E3:** `herdr config check` and `herdr integration status` are explicit smoke gates.

### R5 — Strongly isolated roles use CAID + fresh Pi in Herdr

Test Designer and Implementer never share a writable worktree or context. Read-only research/review fleets use pi-subagents; writer and strongly isolated verification roles use Herdr panes plus CAID worktrees.

- **R5-E1:** The Test Designer receives specs and writes tests only; causal red is proven before implementation.
- **R5-E2:** The Implementer receives locked tests/contracts, writes production code only, and runs the covering green command.
- **R5-E3:** `detectCaidCollisions` blocks shared-path Test Designer/Implementer assignments.
- **R5-E4:** Fleet children remain read-only unless each writer has an explicitly isolated worktree.

### R6 — Every handoff is schema-valid and path-based

Role requests, results, approvals, and validation contracts use versioned TypeBox/JSON Schema structures. Handoffs reference artifacts by path and SHA; they do not paste secrets or unbounded transcripts.

- **R6-E1:** Invalid role, phase, workspace, artifact reference, or result shape fails before spawn or phase transition.
- **R6-E2:** A handoff records goal, owned paths, forbidden paths, model/thinking, budget, evidence, blockers, and residual risks.
- **R6-E3:** Custom tools use Pi schemas, bounded output, cancellation, and `withFileMutationQueue` for mutations.

### R7 — Deterministic fitness and security gates fail closed when required

Projects configure only locally available commands. Required unavailable, timed-out, spawn-failed, stale, or non-zero gates block; advisory gaps are visible and never called passing.

- **R7-E1:** Unit, type, acceptance, coverage, mutation, architecture, doctor, security, and performance gates run in deterministic order when configured.
- **R7-E2:** No extension installs or invokes unpinned `@latest` gate tooling.
- **R7-E3:** Strict profiles sandbox shell/file/network access and redact secrets before trajectory persistence.

### R8 — Trajectory, decisions, and budgets become real gates incrementally

The existing pure libraries are first wired as observable/advisory controls, then promoted behind explicit assurance configuration after dogfood evidence.

- **R8-E1:** Error-level trajectory anti-patterns block handoff only when trajectory capture is current, redacted, and enabled.
- **R8-E2:** Accepted decision-store constraints block contradictory high-impact actions when the project opts in.
- **R8-E3:** Fleet spawn stops when a configured hard cost/token/time/iteration budget is exceeded.

### R9 — Human approval seams are explicit and non-forgeable by ordinary model output

Plan, findings, risky action, and final diff approvals are human-owned. The system never auto-merges or auto-deploys.

- **R9-E1:** Auth, payments, migrations, public APIs, destructive git, production access, or major architecture enter `blocked` with a structured approval payload.
- **R9-E2:** A model-provided boolean does not count as independent human approval.
- **R9-E3:** Approval expires when the target SHA, paths, plan fingerprint, or risk changes.

### R10 — Operations are observable, bounded, and recoverable

Herdr and Pi expose role, state, gate, budget, and stale-data status without focus theft. Timeouts are unknown state, not failure or completion; cleanup is conservative.

- **R10-E1:** Blocked agents trigger an icon+text notification without auto-approval or alert spam.
- **R10-E2:** Supervisor recovery follows prompt → wait → get → read with at most two focused resumes.
- **R10-E3:** Dirty worktrees, active writers, unknown pane state, or mismatched SHA block cleanup.
- **R10-E4:** Overnight work is locked-test-only, budget-bound, and cannot merge.

### R11 — Rollout is additive and reversible

Every risky control starts behind configuration or a documented install seam; each package has an explicit rollback and migration path.

- **R11-E1:** Disabling a new orchestrator leaves existing BDD, fleet, herd, and worktree-board commands usable.
- **R11-E2:** Herdr/WezTerm convenience configuration can be reverted without losing Pi package state.
- **R11-E3:** Existing fleet artifact paths and commands remain compatible during migration.

### R12 — The program itself follows BDD/TDD and independent verification

Each implementation package has an Example Map, formulation artifact, causal red, covering green, deterministic gates, and a Grok 4.5 review fleet in verify where useful.

- **R12-E1:** No production path is edited before `bdd_assert_red` for that package.
- **R12-E2:** Parallel work is limited to non-overlapping one-writer worktrees; shared entrypoints are serialized.
- **R12-E3:** Final evidence distinguishes local pass, CI replacement, unavailable, and not-run.

## Questions and current resolutions

- **Q1 — Is Rulesync already configured here?** No. The inherited rule says it is canonical, while this checkout currently has no `rulesync.jsonc` or `.rulesync/**`. The first governance work package must establish or explicitly scope that source before generated-rule changes.
- **Q2 — Should we build one large FSM extension?** No. Existing roadmap decisions reject a mega-extension. Use pure libraries plus thin adapters and a small façade only where composition cannot be achieved through current tools.
- **Q3 — Which multi-agent runtime handles which work?** Pi-subagents/fleets for read-only perspective fan-out; Herdr + CAID + fresh Pi for writers and strongly isolated roles.
- **Q4 — What is the compatibility baseline?** Current machine evidence is Pi 0.84.1 and Herdr 0.8.0/protocol 19; exact pins and supported ranges require a version policy work package.
- **Q5 — Is Herdr’s Pi lifecycle integration ready?** No. `herdr integration status` currently reports Pi not installed; bootstrap and smoke verification are P0.
- **Q6 — Should cost, trajectory, decisions, formal methods, and sandboxing all be hard immediately?** No. Security boundaries and required base gates come first; scaffolded controls progress from observable → advisory → required after reliable telemetry and fixtures.
- **Q7 — Should WezTerm own multi-agent layout?** No. It should provide attach/launch, readable chrome, and optional aggregate status; Herdr owns durable agent layout and state.
- **Q8 — Can temperature/seed determinism be promised for Grok 4.5?** Not universally. Pin provider/model IDs and verification prompts; treat unsupported provider controls as roadmap, not enforced evidence.
- **Q9 — May agents merge or deploy?** No. Human final authority remains invariant.

## Non-goals for the first release

- Replacing Herdr or pi-subagents.
- Merging BDD and fleet extensions.
- Multi-writer shared worktrees.
- Automatic merge, deployment, or protected-branch mutation.
- Claiming OS sandboxing, cryptographic approvals, formal verification, or provider seed control before those controls are actually configured and tested.
