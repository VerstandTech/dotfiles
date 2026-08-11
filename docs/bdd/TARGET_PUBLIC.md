# Target public — Delta Tools high-assurance agentic engineering environment

| Meta | Value |
|------|-------|
| **Product** | Delta Tools / dotfiles: WezTerm → Herdr → Pi agentic engineering control plane |
| **One-line positioning** | A local-first, human-controlled environment for running coding agents with explicit BDD evidence, isolated writers, deterministic gates, and auditable handoffs. |
| **Primary geos / languages** | Global engineering teams; English-first CLI and documentation; current host implementation is macOS-first with bounded Linux bootstrap support. |
| **Document owner** | Delta Tools maintainers |
| **Last updated** | 2026-08-11 |
| **Research pass date** | 2026-08-11 |
| **Confidence** | Medium-high: repository capabilities and constraints are primary-source verified; competitor positioning/pricing is vendor-published and may change. |

## 1. Product job (category)

- **Category:** local agentic coding orchestration, terminal/session runtime, and high-assurance engineering governance.
- **Job statement:** When engineers delegate meaningful repository work to one or more coding agents, they want isolated execution, explicit policy/evidence, bounded authority, and human-controlled delivery so they can gain throughput without silently weakening correctness or security.
- **Non-jobs:** a general consumer AI assistant; a hosted IDE replacement; a fully autonomous merge/deploy service; a cryptographic approval system; a universal sandbox; or a promise that prose prompts alone form a security boundary.

## 2. Competitive landscape

| Competitor | Positioning | Who they target | How they solve the job | Price signal | Acquisition engine | Source URLs |
|------------|-------------|-----------------|------------------------|--------------|--------------------|-------------|
| Claude Code | Agentic coding across terminal, IDE, desktop, and web with project instructions, tools, hooks, and subagents. | Individual developers through teams and enterprises already using Claude. | Interactive permissions, configurable hooks/tools, project memory, background/cloud work, and delegated agents. | Included in paid Claude plans; official upgrade page shows Pro and higher-capacity Max plans, with team/enterprise packaging. | Claude ecosystem, terminal adoption, documentation, and enterprise AI relationships. | [Product](https://claude.com/product/claude-code), [Overview](https://docs.anthropic.com/en/docs/claude-code/overview), [Plans](https://claude.ai/upgrade) |
| OpenAI Codex | A coding-agent command center spanning CLI, app, IDE, cloud tasks, worktrees, skills, and automations. | Professional developers and engineering organizations using ChatGPT/OpenAI. | Sandboxed local/cloud execution, parallel tasks, worktree isolation, reviewable diffs, skills, and queued automations. | Bundled with eligible ChatGPT plans; Business and Enterprise packaging is emphasized rather than a separate Codex subscription. | ChatGPT distribution, IDE/CLI entry points, and team workspace adoption. | [Codex](https://openai.com/codex/), [Codex app](https://openai.com/index/introducing-the-codex-app/), [Business pricing](https://openai.com/business/pricing/) |
| GitHub Copilot coding agent | Background coding work anchored in GitHub issues, ephemeral environments, commits, and pull requests. | GitHub-native individual developers, maintainers, and managed organizations. | GitHub Actions-backed ephemeral environments, repository instructions, custom agents, automated tests, commits, and mandatory PR review. | Free usage is limited; official plans page packages agent capacity and controls across Pro, higher-usage individual, Business, and Enterprise tiers. | GitHub repository workflow, issue assignment, pull requests, marketplace, and enterprise administration. | [Cloud agent](https://docs.github.com/copilot/concepts/agents/cloud-agent/about-cloud-agent), [Plans](https://github.com/features/copilot/plans) |
| Cursor cloud agents | Asynchronous agents in isolated cloud VMs with cloned repositories, integrations, artifacts, and remote control. | Individual developers and teams that want parallel work without tying up local machines. | Dedicated VMs, environment setup, secrets/network controls, hooks, transcripts, logs, screenshots, and remote desktop. | Cloud agents are tied to paid individual/team plans with model usage and spend controls; Enterprise is custom. | Editor adoption, cloud-agent handoff, Slack/GitHub integrations, and team collaboration. | [Cloud-agent docs](https://cursor.com/docs/cloud-agent), [Pricing](https://cursor.com/pricing) |
| Warp | An agentic development environment and terminal that can orchestrate Warp and third-party coding agents locally and in the cloud. | Terminal-heavy developers, agent power users, and organizations wanting a common agent surface. | Block-oriented terminal UX, agent workflows, local/cloud handoff, multi-agent operation, usage governance, and enterprise controls. | Official pricing uses free, individual credit-based, business per-user, and custom enterprise tiers. | Terminal replacement, open-source distribution, agent integrations, and team governance. | [Product](https://www.warp.dev/), [Agents](https://www.warp.dev/agents), [Pricing](https://www.warp.dev/pricing) |

### Category insights

- Vendor pages converge on parallel/background agents, isolated environments, reusable instructions or skills, and reviewable diffs rather than unchecked autonomy.
- Security and governance are packaging differentiators: sandboxes, permissions, secrets controls, hooks, policy, visibility, and enterprise administration recur across offerings.
- The repeated buyer pain is not merely “write code faster”; it is delegating without losing repository context, human review, environment integrity, or confidence in the resulting tests.
- Delta Tools' honest wedge is composable local authority: WezTerm owns host UX, Herdr owns durable runtime state, Pi owns BDD and policy, and Git/GitHub remain delivery truth. It favors explicit evidence and rollback over a proprietary cloud command center.
- The repository does not currently offer hosted VM isolation, organization billing, a managed policy dashboard, automatic deployment, or universal OS support. Gherkin must not claim those competitor capabilities.

### Sources

- [Claude Code overview](https://docs.anthropic.com/en/docs/claude-code/overview) — accessed 2026-08-11 — terminal/IDE/web capability, tools, project instructions, and delegation.
- [Claude plans](https://claude.ai/upgrade) — accessed 2026-08-11 — paid-plan packaging signal.
- [OpenAI Codex](https://openai.com/codex/) — accessed 2026-08-11 — coding-agent positioning and professional/team use.
- [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/) — accessed 2026-08-11 — multi-agent command center, worktrees, skills, and automations.
- [OpenAI Business pricing](https://openai.com/business/pricing/) — accessed 2026-08-11 — team/business packaging signal.
- [GitHub Copilot cloud agent](https://docs.github.com/copilot/concepts/agents/cloud-agent/about-cloud-agent) — accessed 2026-08-11 — ephemeral environment, issue-to-PR workflow, and human review.
- [GitHub Copilot plans](https://github.com/features/copilot/plans) — accessed 2026-08-11 — individual and organization packaging signal.
- [Cursor cloud-agent documentation](https://cursor.com/docs/cloud-agent) — accessed 2026-08-11 — isolated VM, parallel execution, integrations, and artifacts.
- [Cursor pricing](https://cursor.com/pricing) — accessed 2026-08-11 — individual/team/enterprise packaging signal.
- [Warp agents](https://www.warp.dev/agents) — accessed 2026-08-11 — agentic terminal and third-party-agent orchestration.
- [Warp pricing](https://www.warp.dev/pricing) — accessed 2026-08-11 — credit-based individual and business packaging signal.
- [Repository implementation plan](../plans/pi-herdr-wezterm-high-assurance-implementation-plan.md) — accessed 2026-08-11 — product truth, authority boundaries, package status, and non-goals.
- [Repository README](../../README.md) — accessed 2026-08-11 — supported dotfile layout, Rulesync governance, and root assurance commands.

## 3. Market constraints

- **Budget reality:** this is internal/open developer tooling, not a sold SaaS plan. The relevant budget is engineering time plus existing model/agent subscriptions; operators reject orchestration that costs more attention than it saves.
- **Platform dependency:** the current lived workflow depends on macOS, WezTerm, Herdr 0.8+, Pi, Git worktrees, Bun, and GitHub CLI. Linux bootstrap is deliberately narrower; Windows is not a shipped host promise.
- **Locale/regulatory notes:** artifacts and CLI contracts are English-first. Security-sensitive users may need organization-specific retention, privacy, or compliance controls not yet shipped.
- **Desktop skew:** this is keyboard-first terminal engineering. Mobile is relevant only for notifications or reviewing GitHub, not for authoring/running the local control plane.
- **Trust constraint:** prompt instructions are not a security boundary. Required assurance depends on typed contracts, explicit trust tiers, exact fingerprints, isolated worktrees, and human authority.

## 4. Persona set

### Summary table

| ID | Name | Segment | IQ (1–5) | Primary? | Default JTBD lens |
|----|------|---------|----------|----------|-------------------|
| A | Leo | Solo staff engineer and dotfiles maintainer | 5 | yes | Delegate deeply while retaining exact local authority and rollback. |
| B | Maya | Engineering manager / platform lead | 4 | yes | Accept handoffs only when policy, ownership, and evidence are current. |
| C | Nikhil | Product-security and reliability engineer | 5 | no | Prove secrets, permissions, and failures stay bounded and auditable. |
| D | Sofia | Product engineer adopting agentic CLI workflows | 3 | no | Understand why a gate blocked and recover without bypass guesswork. |
| E | André | Open-source agent tooling maintainer | 5 | no | Keep cross-harness resources portable, versioned, and regression-tested. |

### A — Leo (solo staff engineer and dotfiles maintainer) ⭐ primary

| Field | Content |
|-------|---------|
| **ID** | A |
| **Name** | Leo |
| **Segment** | Senior individual contributor maintaining a personal/team agentic engineering environment. |
| **Primary?** | yes |
| **Age range** | 28–45 |
| **Locale / language** | English CLI/documentation; may work from a non-US locale. |
| **Geography** | Global remote engineering; current machine is macOS. |
| **Occupation / hustle** | Staff engineer, consultant, or technical founder shipping code while maintaining the tooling used to ship it. |
| **Income / willingness to pay** | High professional-tool willingness when it saves hours; “expensive” means recurring agent spend or maintenance that produces more supervision than throughput. |
| **Devices** | High-memory laptop/desktop with WezTerm; phone only for notifications and PR review. |
| **Core platforms** | Terminal, GitHub, Pi, Herdr, WezTerm, multiple model providers, issue trackers. |
| **Tech / product IQ** | 5 — expert; writes extensions, reads source, understands process groups, worktrees, trust boundaries, and test causality. |
| **Patience budget** | 30–60 minutes for a diagnosable infrastructure failure; near-zero patience for silent state drift or fabricated green evidence. |
| **Job to be done (JTBD)** | When delegating a multi-file package to agents, I want deterministic phase, ownership, decision, and test evidence so I can move quickly without becoming the hidden manual orchestrator. |
| **Pain points** | Agent reports “done” while CI or the real path is untested; parallel writers collide; stale sessions obscure which SHA was reviewed; context compaction loses decisions; cleanup kills unrelated processes; prompt-only rules are mistaken for enforcement. |
| **Challenges** | Maintains the tool while using it; multiple local harnesses have different contracts; model and token budgets vary; terminal state outlives chats; security controls must remain practical enough not to be bypassed. |
| **Dreams** | “I can start a rigorous package and trust the workflow to stop at the right boundary.”; “Every pass is bound to the exact SHA and decision fingerprint.”; “Cleanup removes only what this task owned.”; “I can inspect and repair any layer without a proprietary black box.” |
| **Triggers to seek a tool** | A missed regression, a stale worktree, an agent overwriting another lane, a security review finding leaked context, or hours spent manually coordinating tests and PRs. |
| **Current workaround stack** | Shell scripts, Git worktrees, Markdown plans, Pi skills/extensions, Herdr panes, GitHub PR checks, manual notes, and repeated terminal audits. |
| **Competitor gravity** | Claude Code and Codex for capable CLI agents; Warp for terminal orchestration; Cursor for parallel background work. |
| **Fears in-product** | A required gate quietly becoming advisory; an agent mutating approval data; hidden shell execution; deleting the wrong worktree; redaction leaking a secret while explaining failure. |
| **Success signals** | One authoritative writer, exact fingerprints/SHA agreement, causal red then green, stable reason codes, no unrelated dirty paths, and a PR that remains human-merge-only. |
| **Confusion risks** | Treating a mirror as authority; assuming “accepted” means human-approved; confusing a heuristic warning with a required gate; assuming a clean result remains current after store mutation. |
| **Gherkin implications** | Exact identity, stale evidence, contradictory authority, rollback, mutation sensitivity, deterministic ordering, and hostile-input scenarios. |
| **Accessibility / constraints** | Keyboard-first; may use dense terminal layouts for long sessions, so concise stable output matters. |
| **Quotes** | “Show me which authority decided this and which bytes it covered.”; “If it cannot prove current evidence, it must stop—not improvise.” |
| **Anti-persona note** | Not seeking one-click autonomous deployment or prompt-only “YOLO” execution. |

#### Narrative

Leo starts in a terminal before opening an IDE and often has several repositories and agents active at once. He adopts agentic tooling because parallel research, testing, and review can compress days of work into focused hours. He has also seen green-looking automation hide stale checks, test collusion, or a different remote SHA. A professional workflow, to him, is one he can interrupt, inspect, and resume without guessing which process owns a resource. He is willing to accept explicit gates when their reason codes are stable and their recovery path is clear. He churns from tools that hide state in a cloud dashboard or make local cleanup dangerous. He prefers small deterministic libraries behind thin user interfaces. When a decision changes, he expects all approval and handoff evidence derived from the prior fingerprint to become stale. He values aggressive tests more than decorative status. His ideal end state is high autonomy inside narrow authority, followed by a concise human decision point.

#### Desired vs shipped gaps

| They want | We ship today? | Gherkin stance |
|-----------|----------------|----------------|
| Complete end-to-end assurance orchestration | partial | Assert only package-level contracts and existing merged authorities; keep future integration explicit. |
| Strong process/worktree ownership | partial | Assert writer-board and exact worktree/SHA rules where implemented. |
| Cryptographically signed approvals | no | Out of scope; never imply signatures. |
| Decision evidence before every action | partial | DEC-01 asserts pure typed evidence; FIT-01 owns later live integration. |

### B — Maya (engineering manager and platform lead) ⭐ primary

| Field | Content |
|-------|---------|
| **ID** | B |
| **Name** | Maya |
| **Segment** | Manager accountable for team delivery, platform safety, and review quality. |
| **Primary?** | yes |
| **Age range** | 32–50 |
| **Locale / language** | English-first distributed team. |
| **Geography** | North America, Europe, or globally distributed company. |
| **Occupation / hustle** | Engineering manager, developer-productivity lead, or platform owner balancing velocity with incident and compliance risk. |
| **Income / willingness to pay** | Controls team tooling budget; accepts paid seats when controls reduce review and incident costs; “expensive” means opaque usage plus new operational headcount. |
| **Devices** | Managed laptop, GitHub web, terminal for diagnosis, dashboards for aggregate visibility. |
| **Core platforms** | GitHub, CI, issue tracker, team chat, identity provider, coding-agent vendors. |
| **Tech / product IQ** | 4 — high; understands delivery systems and can inspect evidence, but should not need to debug parser internals. |
| **Patience budget** | 10–15 minutes to decide whether a handoff is trustworthy; less than 5 minutes for routine approval. |
| **Job to be done (JTBD)** | When an agent-produced change reaches review, I want current policy and test evidence tied to the candidate so I can approve human merge without reconstructing the whole session. |
| **Pain points** | Reviewers cannot tell whether a check ran on the current SHA; teams interpret “AI approved” inconsistently; agent spend grows without measurable assurance; incidents expose undocumented exceptions; local workflows are hard to standardize. |
| **Challenges** | Different developer machines and providers; pressure to increase throughput; limited appetite for new dashboards; security and legal stakeholders need traceability; required controls must not halt all work on ambiguous prose. |
| **Dreams** | “A handoff tells me exactly what passed, what remains risky, and who retains authority.”; “Policy changes invalidate stale approvals automatically.”; “Teams can use different models without changing the governance contract.” |
| **Triggers to seek a tool** | A bad AI-generated PR, audit request, escaped secret, repeated flaky review, or leadership mandate to scale agent usage safely. |
| **Current workaround stack** | Branch protections, CI, pull-request templates, CODEOWNERS, security scanners, team conventions, and manual approval checklists. |
| **Competitor gravity** | GitHub Copilot for repository-native governance; Codex/Cursor for parallel work; Claude Code for flexible developer workflows. |
| **Fears in-product** | False compliance theater; local exceptions that are invisible; unreadable evidence dumps; required checks based on fuzzy language; agents approving their own policy mutations. |
| **Success signals** | Short evidence with trusted executor metadata, exact fingerprints, explicit human-review requirements, deterministic failure codes, and no automatic merge. |
| **Confusion risks** | Interpreting advisory as passed; assuming a store is trusted because it is in Git; assuming rejected policy means prohibited behavior; assuming a prior action result survives decision mutation. |
| **Gherkin implications** | Handoff freshness, role/authority separation, missing-approval recovery, deterministic summaries, and no fabricated pass scenarios. |
| **Accessibility / constraints** | Often scans evidence between meetings; output must be concise, ordered, and readable without terminal color. |
| **Quotes** | “I need the current evidence, not a story about what probably ran.”; “The agent cannot approve the rulebook it just edited.” |
| **Anti-persona note** | Not a full-time local tooling maintainer and will reject workflows that require source-level debugging for routine approval. |

#### Narrative

Maya is measured on delivery speed and system reliability at the same time. Her team wants stronger coding agents, but each provider represents actions, sessions, and approvals differently. She does not want to ban agent usage or require a central monolith. She wants a portable minimum contract that makes a pull request understandable. A failed gate is acceptable when it names a stable recovery condition. A fuzzy gate that sometimes blocks based on title words is not acceptable. She needs to distinguish an accepted policy from a human-approved, current policy snapshot. She also needs to explain the process to security and leadership without exposing developer secrets or raw model transcripts. She churns if evidence is too verbose to review or if every exception becomes permanent configuration drift. Success is a repeatable human decision, not unattended merge throughput.

#### Desired vs shipped gaps

| They want | We ship today? | Gherkin stance |
|-----------|----------------|----------------|
| Organization-wide policy dashboard | no | Out of scope. |
| Immutable audit retention | partial | OBS-01 owns persistence; DEC-01 emits pure evidence only. |
| Provider-independent gate semantics | partial | Assert canonical internal/trust metadata where merged; FIT-01 owns integration. |
| Human-controlled merge | yes | Preserve as an invariant. |

### C — Nikhil (product-security and reliability engineer)

| Field | Content |
|-------|---------|
| **ID** | C |
| **Name** | Nikhil |
| **Segment** | Security/reliability specialist reviewing agent execution and evidence boundaries. |
| **Primary?** | no |
| **Age range** | 27–48 |
| **Locale / language** | English technical documentation. |
| **Geography** | Global company with security, privacy, or regulated-customer obligations. |
| **Occupation / hustle** | Product-security engineer, SRE, security architect, or internal red team. |
| **Income / willingness to pay** | Enterprise tooling budget; cost is secondary to demonstrable containment and low false-assurance risk. |
| **Devices** | Managed workstation, terminal, security tooling, CI and log platforms. |
| **Core platforms** | GitHub, scanners, SIEM/logging, identity systems, sandbox/container tools, agent APIs. |
| **Tech / product IQ** | 5 — expert; threat-models parsers, paths, permissions, egress, provenance, and race conditions. |
| **Patience budget** | Hours for a formal review; seconds for a required gate to fail closed. |
| **Job to be done (JTBD)** | When agent actions rely on project governance, I want bounded parsing and non-forgeable current evidence so malicious or accidental input cannot manufacture authorization. |
| **Pain points** | Prompt injection crosses tool boundaries; logs leak tokens; symlink/path tricks escape scope; mutable files retain stale approval; error messages echo hostile input; “trusted” is self-asserted. |
| **Challenges** | Local developer machines are heterogeneous; full sandboxing is not yet universal; usability pressure encourages bypass; JavaScript objects can be hostile; integrations introduce TOCTOU windows. |
| **Dreams** | “Every untrusted boundary has a typed fail-closed contract.”; “No detected credential becomes a hash oracle.”; “A stale approval is mechanically impossible to call passed.” |
| **Triggers to seek a tool** | Credential incident, agent supply-chain concern, compliance review, sandbox escape report, or unexplained policy bypass. |
| **Current workaround stack** | Secret scanners, branch protection, code review, sandbox profiles, least-privilege tokens, filesystem ACLs, and manual threat models. |
| **Competitor gravity** | Cursor cloud VMs for isolation, GitHub ephemeral agents, Codex sandboxing, and enterprise controls from major vendors. |
| **Fears in-product** | Raw values in refusals; canonical bytes returned on failure; mutable snapshots; path-prefix confusion; heuristic policy treated as authorization; approval metadata writable by the same agent. |
| **Success signals** | Stable non-echoing codes, bounded hostile-input tests, exact fingerprint binding, deep freezing/detachment, mutation kills, and independent adversarial review. |
| **Confusion risks** | Treating source-path validation as realpath authority; treating matching fingerprints as cryptographic signer identity; assuming pure DEC-01 closes future adapter races. |
| **Gherkin implications** | Hostile values, unsafe paths, bounds, stale approval, mutation sensitivity, source-authority honesty, and residual-risk scenarios. |
| **Accessibility / constraints** | Needs plain-text evidence export for review systems; cannot depend on terminal color. |
| **Quotes** | “Trust is a property of the evidence chain, not a field named trusted.”; “Failure output is also an exfiltration surface.” |
| **Anti-persona note** | Not satisfied by vendor security claims without reproducible local evidence. |

#### Narrative

Nikhil joins after a workflow already appears useful and asks what happens under adversarial input. He begins with authority boundaries rather than UI. He assumes any agent-writable file may change after approval and that any input-derived error can leak a secret. He wants pure deterministic libraries because they are easier to exercise and mutate than live extension hooks. He distinguishes structural path checks from filesystem containment and expects the documentation to do the same. He will accept a narrow V1 when exclusions are explicit. He will not accept a required pass derived from fuzzy natural-language matching. He expects independent review to replay counterexamples rather than praise test count. His ideal evidence is boring, bounded, and mechanically tied to the candidate under review.

#### Desired vs shipped gaps

| They want | We ship today? | Gherkin stance |
|-----------|----------------|----------------|
| OS-enforced sandbox for every child | partial | SEC-01/ISO-01 own later enforcement; do not claim universal containment. |
| Cryptographic approval identity | no | Explicitly out of scope. |
| Pre-persistence secret redaction | yes, library only | RED-01 is mandatory before future sinks; no live sink claim. |
| Pure decision fingerprint/evidence | DEC-01 target | Assert deterministic library behavior and adapter exclusions. |

### D — Sofia (product engineer adopting agentic CLI workflows)

| Field | Content |
|-------|---------|
| **ID** | D |
| **Name** | Sofia |
| **Segment** | Experienced application engineer new to high-assurance multi-agent orchestration. |
| **Primary?** | no |
| **Age range** | 23–40 |
| **Locale / language** | English CLI with occasional non-native fluency. |
| **Geography** | Global remote product team. |
| **Occupation / hustle** | Frontend/full-stack product engineer shipping features under sprint pressure. |
| **Income / willingness to pay** | Uses company-provided tools; personally tolerates modest subscriptions, but time-to-learn is the real cost. |
| **Devices** | Laptop, IDE, terminal, browser, GitHub. |
| **Core platforms** | GitHub, issue tracker, IDE, team chat, one or two coding agents. |
| **Tech / product IQ** | 3 — medium for orchestration; strong coder but learns one new governance concept at a time. |
| **Patience budget** | 5–10 minutes before asking for help or reaching for a bypass. |
| **Job to be done (JTBD)** | When a governance gate stops my agent, I want a stable reason and safe recovery so I can finish the feature without weakening team policy. |
| **Pain points** | Dense evidence jargon; unclear difference between stale and failed; unexplained path rejection; too many terminal panes; approvals that appear to vanish; fear of deleting another task's worktree. |
| **Challenges** | Sprint deadlines, partial knowledge of local infrastructure, multiple command syntaxes, and little time to investigate internals. |
| **Dreams** | “The gate tells me exactly what changed and who must review it.”; “I can retry safely without memorizing the architecture.”; “Power users get rigor without making my normal path hostile.” |
| **Triggers to seek a tool** | First large agent-generated refactor, repeated PR review feedback, or a team mandate to use isolated worktrees and BDD. |
| **Current workaround stack** | IDE agent, terminal commands copied from docs, GitHub checks, and help from a platform engineer. |
| **Competitor gravity** | Cursor for approachable background agents; GitHub Copilot for issue/PR integration; Claude Code for terminal flexibility. |
| **Fears in-product** | Breaking the repository, losing work, looking careless after a bypass, opaque red error output, or being blocked by a policy she cannot inspect. |
| **Success signals** | Plain reason code plus next human action, no data loss, unchanged unrelated tasks, and a PR with understandable evidence. |
| **Confusion risks** | Assuming rejected means forbidden; thinking a hash is a secret; treating source writability as an automatic compromise; confusing a scoped rule with global policy. |
| **Gherkin implications** | Missing approval, stale approval, path-scope boundaries, deterministic recovery, and concise refusal scenarios. |
| **Accessibility / constraints** | May use a smaller laptop display and terminal zoom; output should not rely on wide tables or color alone. |
| **Quotes** | “Tell me whether I need to change the code, refresh approval, or call the platform owner.”; “Don't make ‘bypass’ the easiest understandable option.” |
| **Anti-persona note** | Not a novice programmer; the lower fluency is specific to this orchestration product. |

#### Narrative

Sofia already uses an AI assistant for tests and repetitive code. She becomes interested in background agents when a refactor spans several modules. The first high-assurance workflow feels unfamiliar because it names phases, leases, fingerprints, and trust tiers. She is willing to learn if each block maps to one recovery step. She dislikes rules that appear arbitrary or depend on secret vocabulary. A stale fingerprint makes sense when shown as “policy changed after approval.” A fuzzy title-word match does not. She needs the workflow to preserve unrelated work even when her task fails. She will bypass if the safe path is not legible under sprint pressure. A professional experience lets her recover without understanding implementation internals and teaches the right mental model over time.

#### Desired vs shipped gaps

| They want | We ship today? | Gherkin stance |
|-----------|----------------|----------------|
| Guided visual recovery UI | no | Assert stable machine-readable codes; UI belongs to later packages. |
| Automatic safe refresh of human approval | no | Must require an explicit human review. |
| Clear path-scope behavior | DEC-01 target | Cover exact boundary and pathless cases. |
| One-click agent orchestration | partial | Do not assert beyond existing tools. |

### E — André (open-source agent tooling maintainer)

| Field | Content |
|-------|---------|
| **ID** | E |
| **Name** | André |
| **Segment** | Maintainer adapting reusable AI skills and deterministic contracts across harnesses. |
| **Primary?** | no |
| **Age range** | 25–50 |
| **Locale / language** | English documentation; may maintain localized teams. |
| **Geography** | Global open-source ecosystem. |
| **Occupation / hustle** | Tooling maintainer, developer advocate, or framework engineer integrating multiple agent providers. |
| **Income / willingness to pay** | Mix of employer budget and personal subscriptions; expensive means vendor lock-in or high maintenance across releases. |
| **Devices** | Laptop/desktop across macOS and Linux test hosts. |
| **Core platforms** | GitHub, package registries, multiple agent CLIs, CI, terminal multiplexers. |
| **Tech / product IQ** | 5 — expert in package/version compatibility, schemas, testing, and extension APIs. |
| **Patience budget** | 20–40 minutes for a reproducible compatibility issue; little patience for undocumented generated drift. |
| **Job to be done (JTBD)** | When agent vendors change interfaces, I want portable, versioned pure contracts so governance behavior survives without duplicating each provider's control plane. |
| **Pain points** | Breaking CLI/RPC changes; generated files mistaken for source; provider-specific semantics leak into shared skills; duplicated gate enums drift; examples become outdated; hidden global state makes tests flaky. |
| **Challenges** | Fast-moving dependencies, inconsistent permission models, cross-platform paths, limited contributor context, and the need to preserve backward compatibility. |
| **Dreams** | “One canonical contract feeds every adapter.”; “Upgrades fail with exact fixtures instead of production surprises.”; “Generated resources remain reproducible from one source of truth.” |
| **Triggers to seek a tool** | Dependency upgrade, new agent provider, community bug report, or repeated hand-maintained configuration drift. |
| **Current workaround stack** | TypeScript schemas, fixtures, compatibility tests, changelog review, source inspection, and generated documentation. |
| **Competitor gravity** | OpenAI skills/worktrees, Claude hooks/skills, GitHub custom agents, and Warp's third-party-agent surface. |
| **Fears in-product** | A new mega-extension, silent compatibility shim, template edits outside Rulesync governance, a second gate vocabulary, or non-deterministic timestamps in fixtures. |
| **Success signals** | Pure libraries, additive versioned types, exact fixtures, root assurance, no generated drift, and clearly serialized integration ownership. |
| **Confusion risks** | Treating the legacy decision helper as authoritative; assuming template presence means live enforcement; confusing semantic normalization with loss of meaningful ordering. |
| **Gherkin implications** | Backward compatibility, deterministic normalization, version rejection, integration ownership, and no-duplicate-enum scenarios. |
| **Accessibility / constraints** | Documentation and output must work in plain Markdown and terminal text. |
| **Quotes** | “Compatibility belongs in fixtures, not in hopeful prose.”; “Compose authorities; don't invent another one.” |
| **Anti-persona note** | Not optimizing only for one vendor's newest hosted environment. |

#### Narrative

André reads release notes and source code before adopting a new orchestration feature. He expects vendor interfaces to move and wants that movement contained at adapters. The dotfiles repository interests him because it separates canonical reusable resources from generated and vendor-specific wiring. He becomes concerned when an integration introduces another status enum or reads global state inside a testable policy function. He prefers an explicit V1 contract even when it is narrower than a clever heuristic. He also cares that existing users do not lose their CRUD helper overnight. He wants a deprecation path where legacy behavior stays advisory while new required evidence is typed. He checks root generation and compatibility tests as carefully as unit tests. Success is a portable contract that later packages can integrate once, in a serialized lane.

#### Desired vs shipped gaps

| They want | We ship today? | Gherkin stance |
|-----------|----------------|----------------|
| Portable enforcement across all harnesses | partial | Assert shared library contracts only; adapters remain provider-specific. |
| Stable canonical gate vocabulary | yes, BDD base | DEC-01 must reuse trusted/internal metadata and not add an enum. |
| Full cross-platform host support | no | Out of scope. |
| Backward-compatible decision helpers | yes, baseline | Keep legacy tests green while preventing trusted authorization. |

## 5. Fluency defaults for Gherkin

| When writing… | Design for persona IQ | Notes |
|---------------|----------------------|-------|
| Empty / first-run | 3 | Explain missing approval or store evidence with one stable recovery condition. |
| Approval / policy wall | 4 | Maya must decide quickly; never hide that a human review is required. |
| Power / batch | 5 | Leo may process many actions, but bounds and deterministic ordering remain explicit. |
| Security failure | 3 | Stable non-echoing code first; detailed internal diagnostics must not expose source content. |
| Compatibility | 5 | André requires exact version, fingerprint, and legacy/advisory distinctions. |

**Rule:** IQ is product literacy and patience budget, not a judgment of intelligence.

## 6. Confusion classes to prefer

- Empty / first run: no approved decision snapshot exists.
- Wrong mental model: accepted status versus human-approved current fingerprint.
- Stale state: store changed after a pre-action result or approval.
- Scope boundary: `src/ui` versus `src/uis`, global versus pathless action.
- Authority confusion: project file, source metadata, BDD state, and human approval have different owners.
- Advisory versus required: legacy heuristic warnings cannot authorize a required action.
- Recovery: explicit human re-review is required; the agent cannot self-refresh approval.
- Partial failure: one failed required action invalidates handoff while unrelated evidence stays represented safely.
- Security/error disclosure: stable codes without raw policy or hostile input.

## 7. Product-truth guardrails

- WezTerm owns host UX; Herdr owns durable PTY/session/runtime state; Pi owns BDD policy and tool contracts.
- `bdd-mode` is phase/evidence authority; `.pi/worktree-board.json` is writer-lease authority.
- Human authority over PR creation checkpoints, approval, merge, and destructive cleanup is invariant.
- Rulesync canonical sources are `rulesync.jsonc` and `.rulesync/**`; generated rule files are not edited directly.
- Product-code fleets remain blocked until SEC-01/G7; read-only review does not establish a write/security boundary.
- RED-01 is the single pre-persistence redaction authority, but no live decision/trajectory sink is enabled yet.
- DEC-01 owns a pure library and typed evidence only. FIT-01 owns canonical quality-gate integration after SEC-01; OBS-01 owns persistence.
- No cryptographic approval signatures, hosted VM service, automatic merge/deploy, or universal sandbox claim exists in V1.
- Required gate passes must use trusted `argv` or `internal` execution metadata; missing usage remains unknown.

## 8. Open questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| TP-Q1 | Should future team deployments add organization-managed decision authority instead of machine-local approval? | APR-01 / product owner | open |
| TP-Q2 | Which DEC-01 reason codes should receive dedicated TUI recovery actions? | FIT-01 / UX | open |
| TP-Q3 | What retention/compliance profiles are needed once OBS-01 persists redacted evidence? | OBS-01 / security | open |
| TP-Q4 | Should Linux become a first-class supported host after the current bootstrap contract? | host tooling owner | open |

## 9. Changelog

| Date | Change |
|------|--------|
| 2026-08-11 | Initial repository analysis, live five-competitor research pass, and five-persona set for high-assurance Gherkin. |
