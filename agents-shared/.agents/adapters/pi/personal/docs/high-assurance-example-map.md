# High-Assurance BDD/TDD Orchestration — Example Map

Focus: deterministic project profiling, stack-aware hard quality gates, isolated agent roles, and auditable BDD handoffs.

## Rules

### R1 — Project profiling is deterministic and local

The extension derives a stable, sorted project profile from trusted repository artifacts (manifests, lockfiles, scripts, configs, and source markers). Re-running against the same files produces the same profile and fingerprint. Detection never installs packages or calls the network.

- **R1-E1:** `package.json` + `bun.lock` + `vite.config.ts` + React dependency → Bun, TypeScript, Vite, and React are detected.
- **R1-E2:** `Cargo.toml` + `Cargo.lock` → Rust and Cargo are detected without assuming a frontend stack.
- **R1-E3:** A polyglot workspace with `package.json` and `Cargo.toml` reports both ecosystems in stable order.

### R2 — Existing project commands win

Gate planning uses explicit `.pi/bdd.json` assurance commands first, matching package scripts second, and conservative ecosystem defaults only when their local prerequisite is present. It never invents a second test stack and never uses unpinned `@latest` commands as an automatic hard gate.

- **R2-E1:** `scripts.coverage` is selected instead of synthesizing a Vitest coverage command.
- **R2-E2:** A React project with a locally installed `react-doctor` binary gets a doctor gate; a project without it gets an actionable unavailable/advisory item, not an implicit network install.
- **R2-E3:** Explicit assurance command overrides are preserved exactly and marked as configuration-sourced.

### R3 — Gate plans are typed, ordered, and fail closed

Every gate has a stable id, kind, command, source, required/advisory policy, timeout, and optional numeric threshold. Gate order is deterministic: format/static/types → unit/acceptance/property → coverage/mutation → architecture/doctor/security → performance.

- **R3-E1:** Two profiles with the same evidence produce deeply equal gate plans.
- **R3-E2:** Required configured gate kinds that cannot be resolved appear as blocking `unavailable` gates.
- **R3-E3:** Advisory unresolved gates are reported but do not falsely claim success.

### R4 — Execution is bounded and auditable

The gate runner executes only in verify (or explicit dry-run elsewhere), runs required gates sequentially, honors per-gate timeouts, stops after the first required failure, and records concise command evidence plus the profile/plan fingerprint.

- **R4-E1:** A required typecheck failure prevents unit and later gates from running.
- **R4-E2:** An advisory doctor failure is recorded and execution continues.
- **R4-E3:** Timeout, spawn failure, or command-not-found can never count as a passing gate.

### R5 — Assurance evidence cannot be stale

A hard-gate run is valid for handoff only when it completed after the latest green evidence and matches the current deterministic plan fingerprint. Starting a new BDD cycle or recording a newer green invalidates prior assurance evidence.

- **R5-E1:** Gates pass, then a newer green run is recorded → handoff requires gates again.
- **R5-E2:** Gate configuration changes after a passing run → fingerprint mismatch blocks handoff.

### R6 — Separation of powers is explicit

Packaged roles define specifier, test designer, implementer, breaker, fitness guardian, and QA responsibilities with least-privilege tool allowlists. The deterministic blueprint describes allowed phase, inputs, outputs, and handoff criteria per role. One writer operates in the active worktree; review/guardian/QA roles are read-only.

- **R6-E1:** The specifier can produce specs but has no edit/write tools.
- **R6-E2:** The fitness guardian reports deterministic gate evidence and cannot modify production files.
- **R6-E3:** The blueprint never schedules parallel writer roles in one worktree.

### R7 — Handoff exposes the full assurance result

When assurance is enabled, `bdd_handoff` reports profile, plan fingerprint, gate pass/fail/unavailable counts, required failures, and staleness. It is incomplete until all required gates are current and green.

- **R7-E1:** Unit green + acceptance recorded but no assurance run → incomplete handoff.
- **R7-E2:** All required gates pass after green → assurance portion is complete.

### R8 — The August 2026 playbook is canonical and versioned

The complete “High-Assurance Multi-Agent Software Development Playbook” v1.2 is stored in the package, including sections 1–20 and production-hardening subsections. Pi-specific implementation claims remain separate so the normative target is not confused with currently enforced behavior.

- **R8-E1:** The canonical document contains the exact title, version, sections 1–20, priority order, closing, and attribution supplied by the human operator.
- **R8-E2:** The BDD and ship skills plus the extension README link to the canonical playbook.
- **R8-E3:** A separate Pi implementation profile maps implemented guarantees, configurable gates, limitations, and roadmap items without claiming that aspirational controls are already enforced.

### R9 — Skills operationalize the playbook without weakening deterministic policy

The BDD and ship skills translate the playbook into actionable phase, isolation, approval, and gate instructions. They never turn a named external tool into an implicit install or unpinned network command.

- **R9-E1:** The BDD skill instructs agents to read the canonical playbook for high-assurance work and preserve schema-based handoffs, independent tests, one writer, and final human authority.
- **R9-E2:** The ship skill has explicit plan, findings, and diff approval seams for high-risk changes.
- **R9-E3:** Tool examples such as doctor, coverage, formal, replay, security, and chaos checks run only through project-configured or locally detected commands; missing tools remain visible setup work.

### R10 — Specialized roles cover the layered oracle model

Role contracts mention the playbook-relevant oracles appropriate to their bounded responsibilities while retaining fresh contexts and least-privilege tool allowlists.

- **R10-E1:** Test Designer covers unit, acceptance, property, trajectory, contracts/invariants, fuzz/adversarial boundaries, and differential or golden-master testing where applicable.
- **R10-E2:** Fitness Guardian covers coverage, mutation, complexity/CRAP, duplication, architecture, doctor, security/supply-chain, contracts, semantic stability, cost/latency, and configured formal/replay checks.
- **R10-E3:** QA covers scripted procedures, performance/resource budgets, concurrency/jitter, recovery, and bounded chaos testing without replacing human exploratory testing.

### R11 — The extension exposes deterministic playbook discovery

Humans and agents can ask bdd-mode for the canonical document location and an honest summary of what the current Pi implementation enforces versus what requires explicit project configuration or remains roadmap work.

- **R11-E1:** `/bdd playbook` reports the canonical playbook path, version, implementation profile, and no-auto-install policy.
- **R11-E2:** `bdd_playbook` returns the same deterministic metadata through a structured tool result.
- **R11-E3:** Extension help and README list both surfaces.

## Questions and resolutions

- **Q1:** Should automatic detection install missing doctor/coverage/mutation tools? **Resolved:** no; detection is read-only and offline. Report a setup recommendation or require an explicit project command.
- **Q2:** Should every inferred advanced gate be hard by default? **Resolved:** no. Existing executable project scripts are hard; inferred optional tools are advisory unless listed in `assurance.requiredGateKinds`.
- **Q3:** Should an LLM own orchestration transitions? **Resolved:** no. Pure functions build the blueprint and gate plan; extension code enforces phase transitions and execution policy. LLM agents receive bounded role tasks only.
- **Q4:** Does this release autonomously merge or ship? **Resolved:** no. Human approval remains final; this release builds deterministic profiling, gate execution/evidence, role contracts, and handoff enforcement.
- **Q5:** Does adopting the full playbook mean every named 2026 tool is installed or executed automatically? **Resolved:** no. The document is the normative target; the extension executes only explicit or safely detected local commands and never performs implicit installs.
- **Q6:** Should aspirational controls be presented as implemented guarantees? **Resolved:** no. The canonical playbook and Pi implementation profile are separate, and each control is labeled enforced, configurable, or roadmap.
- **Q7:** Must every low-risk change use every Tier 2/3 technique? **Resolved:** no. Core gates stay mandatory according to project policy; formal, chaos, replay, semantic-stability, and similar controls are selected by risk and become hard only when configured.

## Non-goals for this slice

- Bit-identical code generation.
- Automatic package installation or remote tool discovery.
- Automatic source mutation for mutation testing.
- Parallel writers in the same worktree.
- Mandatory formal verification for every project; formal commands can be configured as explicit gates.
