# SEC-01 Example Map — Trust tiers, sandboxing, secret hygiene, and supply-chain gates

**Package:** SEC-01
**Focus:** reduce Pi's host-permission blast radius with monotonic trust profiles, process-local sandbox capabilities, secret/environment/path/egress enforcement, RED-01 tool-result sanitation, and typed security-gate slots before unattended execution.
**Dependencies:** CON-01 bounded contracts/path policy, RED-01 pre-persistence redaction, SEC-00 fleet-child containment, BDD-01 trusted executor and causal-gate evidence, plus read-only evaluation of Pi's official sandbox and Gondolin examples.
**Primary personas:** Leo (solo staff engineer and dotfiles maintainer), Maya (engineering manager/platform lead), and Nikhil (product-security/reliability engineer).
**Secondary personas:** Sofia (product engineer adopting agentic CLI workflows) and André (open-source agent-tooling maintainer).

## Discovery sources and backend decision

- Pi's official `examples/extensions/sandbox/index.ts` composes `@anthropic-ai/sandbox-runtime`, wrapping tool execution with filesystem/network policy. Its example falls back to a disabled sandbox after initialization failure; SEC-01 cannot reuse that permissive fallback for strict or overnight execution.
- Pi's official `examples/extensions/gondolin/index.ts` routes built-in tools into a Linux micro-VM whose `/workspace` mount writes through to the host. It demonstrates a stronger guest boundary but introduces image/QEMU lifecycle and a different filesystem/network policy surface.
- Current primary sources reviewed on 2026-08-11: [sandbox-runtime npm](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime), [sandbox-runtime GitHub](https://github.com/anthropic-experimental/sandbox-runtime), [Gondolin npm](https://www.npmjs.com/package/@earendil-works/gondolin), [Gondolin GitHub](https://github.com/earendil-works/gondolin), and [Gondolin limitations](https://earendil-works.github.io/gondolin/limitations/).
- SEC-01 adopts a staged backend contract: `sandbox-runtime` is the preferred lightweight V1 capability shape; Gondolin remains a compatible future/explicit alternative. Neither package is automatically installed or pinned by SEC-01. CMP-01/PKG-01 retain version-pin and packaging authority.
- Strict and overnight execution requires a successful process-local capability created by a host adapter. Missing, copied, stale, unsupported, or failed sandbox capabilities refuse execution. Interactive operation may remain unsandboxed only as explicitly `interactive-untrusted` and can never satisfy a strict/overnight or required-security pass.

## Scope and vocabulary

- **Trust profile:** one of `interactive`, `strict`, or `overnight`. Profiles are monotonic: later modes may remove authority but never add an implicit bypass.
- **Runtime class:** one of fleet child, Herdr Pi worker, gate command, or web tool. The same action may be permitted differently by runtime class, but every decision uses one canonical matrix.
- **Sandbox capability:** a process-local, non-serializable value created only after an injected backend observation proves provider identity, platform support, initialization success, and required filesystem/network/process-tree features.
- **Policy request:** a bounded detached description of runtime, action, profile, tool/command metadata, environment names, path facts, egress facts, sandbox facts, and security-gate evidence. Pure policy code does not discover those facts from the host.
- **Policy decision:** a deeply frozen typed permit/refusal containing only package-owned profile/runtime/action metadata and stable non-echoing codes. It never contains secrets, raw commands, tool output, arbitrary paths, or partial authority.
- **Canonical worktree:** an explicit trusted realpath root supplied by the host/ISO-01 boundary. Structural project-relative validation alone is not filesystem containment.
- **Session temp:** a task-specific trusted realpath below a bounded temporary root. The whole global `/tmp` directory is never writable authority.
- **Security-gate slot:** one of `secret`, `sast`, `sca`, or `license`, represented as a sub-slot of the existing canonical `security` quality-gate kind. SEC-01 does not add a second BDD gate enum or select package versions.
- **Owned paths:** new modules/tests/fixtures under `agents-shared/.agents/adapters/pi/personal/lib/security/**` except RED-01's stable module, new `extensions/security-policy.ts`, security templates/docs/config, and narrowly additive SEC-00 child-policy tests/tightening where required.
- **Out of scope:** choosing/installing dependency versions; universal OS sandbox guarantees; cryptographic identity; approval authority; worktree leases; role definitions; orchestration; trajectory persistence; canonical FIT-01 gate integration; notification/cleanup; autonomous merge or deployment.

## Rule 1 — Pure policy has no ambient authority and cannot manufacture trust

### Examples

1. The policy library receives decoded bounded values and contains no reads of files, environment, network, clocks, processes, sockets, timers, package registries, or global extension state.
2. Host facts such as resolved paths, link counts, sandbox support, environment names, redirect targets, and installed gate identity arrive through explicit injected observations.
3. A caller-supplied boolean such as `trusted`, `sandboxed`, `approved`, `force`, `unsafe`, or `allowAll` cannot create a capability or permit an action.
4. A copied, reconstructed, deserialized, proxied, or object-shaped sandbox capability is refused; only a process-local capability created after successful initialization is accepted.
5. A policy decision cannot grant a worktree lease, approve a plan, mark a BDD gate passed, spawn a role, persist an event, or authorize merge.
6. Unknown runtime, profile, action, backend, or authority values refuse before any host executor is invoked.
7. Returned capabilities, normalized requests, policies, and decisions are detached and deeply frozen so caller mutation cannot widen authority after evaluation.
8. Transparent non-throwing JavaScript proxies remain an explicit language-boundary residual; throwing/reflection-hostile and visibly exotic values fail closed.

## Rule 2 — Trust profiles are explicit, monotonic, and non-downgradable

### Examples

1. `interactive` preserves ordinary human-driven development but labels unsandboxed execution `interactive-untrusted`; it cannot satisfy a required strict or overnight decision.
2. `strict` requires current path/environment/egress controls and an active sandbox capability for any command or process-spawning action.
3. `overnight` includes every strict restriction plus headless-safe initialization, current required security-gate slots, bounded runtime, and no UI-dependent recovery.
4. A project file may request a stricter profile but cannot weaken a machine/session profile selected by human-controlled configuration.
5. Missing, malformed, world/group-writable, accessor-backed, or agent-writable profile authority cannot select strict or overnight and cannot downgrade an existing mode.
6. An unknown future profile fails closed rather than falling back to interactive.
7. Changing profile, runtime, worktree identity, sandbox instance, egress policy, environment policy, or gate fingerprint invalidates prior decisions.
8. Disabling strict for interactive rollback never enables overnight; overnight remains unavailable until all required controls are current.

## Rule 3 — One runtime matrix composes existing authorities without duplicating them

### Examples

1. Fleet children reuse SEC-00's canonical agent/tool contract, environment stripping, inspection-path rules, and network-tool restrictions; SEC-01 may only tighten them.
2. Herdr Pi workers receive explicit runtime/worktree/pane identity from HDR-01/ISO-01 adapters; pane focus, labels, or current directory never imply authority.
3. Gate commands reuse BDD-01 executor kind and trust tier; shell executors remain `interactive_untrusted` and cannot self-label trusted.
4. Web tools are explicit provider operations with bounded domain filters and no local filesystem/environment authority; arbitrary network tools are not inferred from names or prose.
5. A permit for one runtime class cannot be replayed as another runtime class.
6. A fleet reviewer permit cannot be replayed by a researcher, Herdr worker, gate command, or web tool.
7. Missing runtime-specific policy is a refusal, not inheritance from the most permissive row.
8. The matrix has deterministic ordering and versioned V1 identifiers so adapters and fixtures cannot silently drift.

## Rule 4 — Sandbox capabilities are observed, process-local, bounded, and fail closed

### Examples

1. The preferred V1 capability describes `sandbox-runtime` support for process-tree wrapping, deny-read/allow-write filesystem policy, deny-by-default network policy, and lifecycle reset.
2. A Gondolin capability may satisfy V1 only when its host adapter proves equivalent required filesystem, network, process-tree, workspace-mount, and teardown features; provider name alone is insufficient.
3. Backend initialization failure returns `sandbox-initialization-failed` without exposing thrown messages, configuration, paths, or commands.
4. Unsupported platform/backend/version returns `sandbox-unsupported`; strict and overnight invoke no protected executor.
5. A capability with missing features, contradictory success/failure facts, unknown provider, stale session id, or reused disposed instance is refused.
6. A successful capability is bound to the current process, profile policy fingerprint, worktree root, and backend observation; serialization cannot preserve it.
7. Interactive mode may continue without a capability only for actions explicitly allowed as `interactive-untrusted` and after a concise operator-visible status.
8. Strict command/process actions and every overnight action require a current active capability; no prompt acknowledgement substitutes for it.
9. Reload/shutdown disposes the active capability exactly once; a later session must initialize a fresh one before protected execution.

## Rule 5 — Environment exposure is minimal, name-based, and secret values never enter decisions

### Examples

1. Strict and overnight start from a fixed minimal environment-name allowlist rather than inheriting the parent environment and subtracting a few known secrets.
2. SEC-00 forbidden keys, secret-name patterns, provider tokens, shell startup injection variables, dynamic-loader variables, credential helpers, and unknown high-risk names are removed before launch.
3. Environment key matching is ASCII case-insensitive where the host platform requires it and deterministic across insertion order.
4. Values remain only in the detached sanitized launch environment required by the immediate executor; they are never included in policy decisions, refusals, audit metadata, hashes, fingerprints, or entropy diagnostics.
5. Accessor, symbol-keyed, prototype-polluted, over-count, over-name-length, non-string, or reflection-hostile environment objects refuse without evaluating getters.
6. Runtime-specific additions require explicit exact key names and cannot be supplied by project files, model text, wildcard regexes, or prefix grants.
7. A synthetic env-dump attempt in strict/overnight receives only the sanitized minimal set and cannot recover removed names through the policy result.
8. An environment sanitation/refusal result is detached, frozen, bounded, and includes counts/names only when names are from the package-owned safe allowlist.
9. Interactive compatibility may retain a wider host environment only outside required evidence and must remain labeled `interactive-untrusted`.

## Rule 6 — Secret reads are denied before tools or sandboxed commands see content

### Examples

1. Reads of repository `.env`, `.env.*`, credential leaves, private keys, auth stores, shell histories, and SEC-00 canonical secret basenames are denied before tool dispatch.
2. Home secret roots such as SSH, cloud-provider, package-registry, GitHub CLI, credential-helper, and Pi/provider authentication stores are denied from injected normalized facts.
3. Case variants, dot-segments, separators, encoded path tricks, alternate spellings, and concrete descendants cannot evade segment-aware matching.
4. Symlink, hardlink, alias, mount, or resolved-path facts pointing into a denied secret root are denied even when the lexical request appears inside the worktree.
5. A multi-link regular file is denied according to SEC-00's hardlink policy; no inode/content probing occurs in the pure library.
6. Secret-path denial returns only `secret-read-denied` plus safe action/runtime metadata; it never echoes the requested or resolved path.
7. A read allowed by source-path heuristics but lacking trusted resolution/link facts cannot satisfy strict or overnight.
8. Safe repository source/docs and explicitly public fixtures remain readable when trusted path facts prove they do not resolve into denied roots.
9. Tool-result redaction remains mandatory even after an allowed read because path policy is not a content-classification oracle.

## Rule 7 — Writes are confined to one canonical worktree or task-specific temp authority

### Examples

1. Strict/overnight writes require trusted requested-parent/resolved-parent/target facts and a current canonical worktree root or session-temp root.
2. A normal file creation below the exact canonical worktree root is allowed only when every existing ancestor resolves within that root.
3. A task-specific temporary file is allowed only below the exact injected session-temp root; global `/tmp`, another task's temp root, and parent directories are denied.
4. Writes to `.env`, credential leaves, `.git` control data, Rulesync-generated outputs, approval stores, writer boards owned by another package, or protected configuration remain denied even inside the worktree.
5. `..`, prefix confusion, sibling roots, nested-worktree aliases, case-fold collisions, Unicode separator tricks, and path-length/bounds violations are denied.
6. Existing symlink targets, symlink ancestors, hardlinked targets, device files, sockets, FIFOs, and unknown file kinds are denied.
7. An absent target may be created only when the trusted parent facts are current and safe; policy does not assume an absent path stays absent after evaluation.
8. Out-of-worktree and unresolved writes return stable non-echoing codes and never include partial canonical paths.
9. TOCTOU remains a host-adapter concern: the executor must bind/recheck trusted facts at dispatch; a pure preflight decision alone is not filesystem authority.

## Rule 8 — Shells, interpreters, and command composition cannot bypass policy

### Examples

1. Required strict/overnight actions never execute a shell command string or argv containing `sh|bash|zsh -c`, command substitution, pipelines, redirects, or joined command text.
2. Project-configured shell gates remain `interactive_untrusted` under BDD-01 and are rejected as required security evidence.
3. Interpreter inline-code forms such as `python -c`, `node -e`, `bun -e`, `ruby -e`, and `perl -e` are denied unless an exact machine-owned policy grants one bounded argv contract for an interactive-only action.
4. `env`, `xargs`, `find -exec`, package-runner indirection, dynamic loader injection, and nested shell launch cannot smuggle a denied executable into strict/overnight.
5. `curl|sh`, direct downloader execution, package install hooks, and network-capable command-line clients are denied unless an explicit runtime/egress rule and active sandbox both permit the exact argv.
6. A command builder receives a dense bounded plain argv array; sparse, accessor, subclassed, symbol-keyed, control-containing, oversized, or hostile arrays refuse.
7. Executable identity is exact normalized argv data, not basename substring, title, prompt, comment, or natural-language intent.
8. Unknown executables and wrappers deny by default in strict/overnight; interactive fallback remains untrusted and cannot produce a required pass.
9. Denial happens before the injected executor call count changes and returns no command/argument echo.

## Rule 9 — Egress is deny-by-default, runtime-specific, and redirect-aware

### Examples

1. Strict/overnight fleet reviewers, Herdr workers, and gate commands have no network egress unless an exact trusted runtime rule grants it.
2. Fleet researchers may use only the canonical web-search tool path already allowed by SEC-00, not raw fetch/bash/socket tools.
3. Web-tool requests use bounded normalized exact domains supplied by trusted policy; project/model wildcards cannot expand the allowlist.
4. IP literals, localhost, link-local, private, multicast, metadata-service, userinfo, non-HTTP schemes, embedded credentials, and malformed hosts are denied unless a machine-owned explicit test-only rule applies.
5. Ports are absent or explicitly allowlisted; domain suffix confusion and trailing-dot/case/IDNA variants normalize before comparison.
6. Every redirect target must be re-evaluated before connection; permission for the initial host does not authorize a different target.
7. DNS rebinding and actual socket enforcement belong to the active backend/host adapter; a hostname-only pure decision cannot claim transport containment.
8. Unauthorized egress returns `egress-denied` without echoing URL, host, query, headers, credentials, or response fragments.
9. Network results still pass through RED-01 before any model-visible or persistent sink.

## Rule 10 — RED-01 is mandatory before tool results cross a model or persistence boundary

### Examples

1. Every intercepted tool result is passed to `redactForPersistence(input: unknown)` before it can be returned to model-visible security telemetry or a later OBS-01 sink.
2. Successful redaction uses only RED-01's detached frozen safe JSON/canonical bytes; raw input is discarded from the policy result.
3. Redaction refusal produces `redaction-refused` and no raw fallback, force option, detector disablement, hash oracle, preview, or partial value.
4. Tool errors are redacted with the same policy as successful results; failure output is not a privileged exfiltration channel.
5. Binary, cyclic, accessor-backed, oversized, over-depth, over-key, symbol, function, bigint, and hostile tool results fail closed without arbitrary error messages.
6. SEC-01 does not modify RED-01's stable implementation, markers, limits, or reason vocabulary.
7. Model-visible blocked-result summaries contain only package-owned codes and bounded safe recovery metadata.
8. OBS-01 remains the sole future persistence owner; SEC-01 introduces no transcript/event/file sink.

## Rule 11 — Security-gate slots reuse canonical gate trust and remain unknown until proven

### Examples

1. SEC-01 publishes exact V1 slots `secret`, `sast`, `sca`, and `license` under the existing canonical `security` quality-gate kind.
2. Each slot receives an injected trusted `argv` or `internal` executor descriptor, tool identity/version observation, candidate SHA/fingerprint, bounded result, and freshness metadata.
3. Shell executors, project-owned commands, missing executor kind, missing/unknown trust tier, stale SHA, stale tool inventory, or unbound results cannot satisfy a slot.
4. Missing/unavailable scanner binaries and unsupported platforms produce `unknown`, never `pass` or an automatically installed tool.
5. A scanner failure remains failure; timeout/abort/unavailable remain distinct and never collapse into success.
6. Strict reports slot status without granting a canonical BDD pass; FIT-01 later owns required quality-gate integration.
7. Overnight requires all configured required slots current and successful before availability; absent required slots fail closed.
8. CMP-01 remains sole version-inventory authority and PKG-01 sole pin/application owner; SEC-01 never chooses `latest`, edits pins, or calls the network to install tools.
9. Slot results are detached, frozen, deterministically ordered, and contain package-owned ids/codes rather than raw scanner output.

## Rule 12 — Hostile inputs, bounds, and contradictions refuse without side effects

### Examples

1. Policy roots must be dense plain objects/arrays with exact allowed keys, ordinary prototypes, bounded depth/key/array/string/serialized sizes, and no accessors or symbol properties.
2. Cycles, subclasses, functions, symbols, bigints, non-finite numbers, sparse arrays, duplicate set-like entries, and reflection errors refuse before evaluation.
3. Duplicate or contradictory runtime rules, allow/deny entries, environment names, domains, paths, gate slots, and backend features refuse instead of applying precedence.
4. An action cannot be both sandboxed and initialization-failed, timed out and completed, allowed and denied, or current and stale.
5. Additive unknown fields are rejected at security-authority boundaries rather than projected away as compatible telemetry.
6. Package-owned limits reuse CON-01 where applicable and publish exact lower operational limits where security evaluation requires them.
7. Every refusal is deterministic across insertion order and contains no arbitrary input-derived message, path, environment name, domain, command, tool output, or partial permit.
8. The executor, sandbox adapter, redactor sink, scanner, and persistence call counts remain zero when preflight input is invalid.

## Rule 13 — Extension lifecycle is explicit, reload-safe, and incapable of silent weakening

### Examples

1. `extensions/security-policy.ts` is a thin adapter over pure policy and RED-01; it does not duplicate path, secret, profile, gate, or redaction rules.
2. Session start resolves explicit human/machine authority, chooses the effective monotonic profile, and initializes at most one backend capability.
3. Strict/overnight initialization failure sets a blocked status and prevents protected tool dispatch; it does not merely notify and continue.
4. Tool-call interception denies before dispatch or routes command execution only through the active sandbox adapter.
5. Tool-result interception redacts before returning safe security telemetry; a redaction failure replaces rather than supplements raw content.
6. Reload/session shutdown disposes capability/resources and unregisters no global state manually beyond Pi's lifecycle; there are no duplicate timers, writers, listeners, or retained permits.
7. The extension owns no persistence, worktree creation, approval prompt, fleet dispatch, Herdr focus, merge, or package-install behavior.
8. Removing/disabling the extension restores legacy interactive behavior but cannot leave overnight marked available or preserve a prior capability.
9. Status/recovery output is plain-text, bounded, ordered, color-independent, and names one stable next action without exposing policy inputs.

## Rule 14 — Decisions and evidence are stable, non-echoing, immutable, and current

### Examples

1. Permit/refusal results include version, profile, runtime class, action class, stable code, and policy/capability fingerprints only when those values are package-owned or validated safe identifiers.
2. Fingerprints cover normalized security semantics and candidate identity but never secret values, raw paths, commands, URLs, headers, outputs, or arbitrary messages.
3. Decisions are process-local pre-action evidence; copied/deserialized values cannot authorize later execution.
4. Host adapters must evaluate immediately before dispatch and reject stale worktree, capability, profile, gate, environment, or egress observations.
5. A denied Sofia-facing response distinguishes safe recovery classes such as select interactive, initialize sandbox, refresh trusted facts, or ask a human, without offering bypass.
6. Maya's handoff may report deterministic counts/statuses, but FIT-01/OBS-01 own canonical gate/persistence integration and no SEC-01 result alone means ship-ready.
7. Error and audit structures remain bounded plain data suitable for RED-01; arbitrary backend/scanner/tool exceptions never cross the boundary.
8. No decision or extension action can merge automatically or weaken human review authority.

## Rule 15 — Rollout preserves existing interactive workflows without false assurance

### Examples

1. Existing SEC-00 fleet containment, RED-01, BDD-01, HDR-01, herd commands, and root suites remain green without strict profile activation.
2. The default installed behavior is explicit interactive compatibility unless a human-controlled trusted source selects stricter policy; absence never implies overnight.
3. Existing tools can remain available interactively, but any action outside strict policy is labeled untrusted and excluded from required evidence.
4. Strict can be disabled for interactive recovery without changing project files or global generated Rulesync outputs.
5. Overnight availability is false until current sandbox, environment, path, egress, and required security-slot evidence all pass.
6. No live product-code fleet runs during SEC-01 development; G7 is claimed only after merged/stowed code, Pi reload, deterministic fixtures, active-backend confirmation, and explicit human-controlled acceptance.
7. Rulesync-generated files, CMP-01 pins, shared BDD gate vocabulary, role policies, and package manifests remain untouched by SEC-01.
8. Provider/platform limitations and unavailable live backend state are documented as residual risks rather than converted into a passing fixture.

## Rule 16 — Verification proves exfiltration and mutation defenses, not configuration presence

### Examples

1. The causal red command is `cd agents-shared/.agents/adapters/pi/personal && bun test lib/security` and must fail because a named strict runtime permits exfiltration, hidden mutation, unsafe gate execution, or unsupported overnight sandbox—not because dependencies/imports are missing.
2. Focused green covers all three profiles and all four runtime classes across environment dump, auth-file read, `.env` write, out-of-worktree/symlink/hardlink write, `curl|sh`, inline interpreter, malicious project gate, unauthorized egress, redaction refusal, and missing sandbox fixtures.
3. Existing RED-01 and SEC-00 suites remain green alongside the new focused security suite.
4. Mutation sensitivity removes sandbox-required enforcement or changes a denied secret/egress action into permit; a named locked test fails and restoration passes.
5. Final verification runs `bash scripts/test-root.sh`, standalone TypeScript checks where available, diff/whitespace/generated-drift/credential-literal scans, and an independent read-only adversarial security review.
6. Live acceptance, if separately approved, is non-destructive: backend doctor/status and sandboxed deny fixtures only. It never reads a real secret, writes outside a disposable fixture, launches product-code fleets, changes egress, installs packages, or mutates user configuration.

## Open questions and package decisions

| ID | Question | SEC-01 decision |
|---|---|---|
| Q1 | Which backend is primary? | Staged V1: `sandbox-runtime` capability shape is preferred; Gondolin is a future/explicit equivalent adapter. No automatic fallback between providers. |
| Q2 | Does SEC-01 install or pin either backend? | No. CMP-01/PKG-01 retain inventory/pin/package authority. Missing installed support remains explicit and fails strict/overnight availability. |
| Q3 | What happens when official sandbox initialization fails? | Interactive may continue only as `interactive-untrusted`; strict/overnight protected execution is refused with a stable code. |
| Q4 | Is Gondolin's `/workspace` mount automatically safe? | No. Write-through mounts require the same canonical worktree/link/path facts and teardown proof; provider isolation does not grant path authority. |
| Q5 | Where does profile authority come from? | Human/machine-local/session authority supplied explicitly to the adapter. Project configuration may tighten but never weaken it. Pure policy performs no file/mode lookup. |
| Q6 | Can project files enable overnight? | No. Overnight requires trusted profile authority plus current process-local capability and required gate evidence. |
| Q7 | What environment strategy is used? | Strict/overnight build a minimal exact allowlist; interactive compatibility may be wider but remains untrusted. Secret values never enter policy evidence. |
| Q8 | Who owns secret path vocabulary? | SEC-00 canonical names/path rules are reused and may be tightened additively; SEC-01 does not create conflicting detectors. |
| Q9 | Is structural path validation enough? | No. Strict/overnight requires injected trusted realpath/link/file-kind facts and dispatch-time rebinding; ISO-01 later owns canonical lease integration. |
| Q10 | Is all of `/tmp` writable? | No. Only an exact task-specific session-temp root supplied as trusted authority. |
| Q11 | Can shell or interpreter gates be trusted? | Required strict/overnight gates use trusted `argv` or `internal`; shell and inline interpreter forms remain untrusted/denied. |
| Q12 | How is web access allowed? | Only explicit provider tools and trusted bounded exact-domain policy; raw network tools and project/model allowlists are denied. |
| Q13 | Are redirects covered? | Every redirect must be re-evaluated by the host adapter/backend. Pure hostname classification alone is not transport enforcement. |
| Q14 | Does SEC-01 redact only persisted events? | No. RED-01 runs before model-visible security telemetry and any future persistent sink, including error results. |
| Q15 | What if RED-01 refuses? | Stable `redaction-refused`; no raw fallback or partial result. |
| Q16 | Are security scanners executed by SEC-01? | SEC-01 defines/evaluates four typed slots and trust/freshness rules. It never auto-installs tools; FIT-01 owns canonical gate integration. |
| Q17 | Which slots are required overnight? | All slots configured as required by trusted machine policy; missing/unavailable/stale is non-passing and blocks overnight. |
| Q18 | Can a security decision be persisted/replayed? | It may be redacted later by OBS-01, but only the process-local current decision can authorize immediate adapter dispatch. |
| Q19 | How are unknown tools/runtimes handled? | Denied in strict/overnight; explicit interactive behavior remains untrusted and cannot satisfy required evidence. |
| Q20 | What is the live G7 threshold? | Merged/stowed code, reload, deterministic cross-runtime fixtures, required gate availability, active sandbox capability, and separately approved non-destructive acceptance. Until then product-code fleets remain blocked. |
| Q21 | Does SEC-01 edit generated Rulesync, CMP pins, or BDD gate enums? | No. Those remain with GOV-01/CMP-01/BDD-01/FIT-01/PKG-01 owners. |
| Q22 | What is the primary mutation target? | Remove sandbox-required enforcement or turn a strict secret/egress denial into permit; the named locked oracle must fail. |
| Q23 | Are Windows and universal Linux/macOS behavior promised? | No. Provider/platform facts are explicit; unsupported configurations fail closed and remain documented. |
| Q24 | Can transparent Proxies be proven absent? | No. Reflection-hostile/exotic shapes refuse, but transparent non-throwing proxies remain a JavaScript boundary residual. |
| Q25 | What recovery does Sofia see? | One stable code and one safe next action—initialize sandbox, refresh facts, use explicit interactive mode, or ask a human—never raw policy data or a bypass recipe. |
| Q26 | What performance/lifecycle budget applies? | Pure decisions are synchronous/bounded; one capability per session; no polling/timers/writers; initialization and teardown are host-bounded and explicit. |

## Coverage summary

- **Rules:** 16
- **Examples:** 134
- **Questions:** 26
- **Primary mutation:** remove strict sandbox requirement or promote denied secret/egress action to permit
- **Focused test:** `cd agents-shared/.agents/adapters/pi/personal && bun test lib/security`
- **Root regression:** `bash scripts/test-root.sh`
