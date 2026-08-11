# HDR-01 Example Map — Typed Herdr 0.8 client and compatibility doctor

**Package:** HDR-01
**Focus:** replace ad hoc Herdr command handling with bounded argv builders, typed protocol-19/schema-1 envelopes, and non-forgeable compatibility-gated client instances.
**Dependencies:** CMP-01 Herdr 0.8 compatibility matrix and fixtures, CON-01 bounds/contracts/path policy, HOST-01 installed Herdr 0.8 baseline.
**Primary personas:** Leo (solo staff engineer and dotfiles maintainer), Maya (engineering manager/platform lead), and Nikhil (security/reliability engineer).
**Secondary personas:** Sofia (product engineer adopting agentic CLI workflows) and André (open-source agent-tooling maintainer).

## Scope and vocabulary

- **Typed client:** a process-local client instance created only after an explicit environment snapshot and live compatibility observation pass. It owns no filesystem, environment, network, clock, socket, or child-process authority; execution is supplied through one injected argv executor.
- **Compatibility doctor:** runs exact argv probes for the installed binary version and Herdr API schema, then delegates version/protocol/schema classification to the CMP-01 compatibility authority.
- **Operation:** one of agent list, agent get, agent read, agent wait, worktree create, agent start, agent prompt, or notification show.
- **Outcome:** one detached, deeply frozen typed value whose top-level kind distinguishes `completed`, `working`, `blocked`, `unknown`, `timeout`, `aborted`, `unavailable`, or `refused`. Timeout, blocked, unknown, and aborted are never represented as pass/fail booleans.
- **Executor report:** a bounded structural value containing exit status, stdout, stderr, and explicit timeout/abort flags. The client never infers timeout or abort from arbitrary text.
- **Opaque identifier:** an explicit Herdr agent name or workspace/tab/pane identifier parsed from a validated envelope; it is never guessed from display order, focus, labels, or naming conventions.
- **Legacy path:** the currently shipped `/herd-task`, widget source, and normalized 0.7.5 parser fixtures. They remain available during HDR-01 rollout and cannot become evidence that the typed 0.8 client succeeded.
- **Owned paths:** new `agents-shared/.agents/adapters/pi/personal/lib/herdr/**`, narrow compatibility re-export/adapter changes under `personal/extensions/herd/**`, and new `pi/tests/herd-client*.test.ts` fixtures.
- **Out of scope:** direct socket access; Herdr installation/repair; worktree leases; role spawning policy; approvals; notification policy; retries/resumes; cleanup; persistence; fleet execution; BDD phase authority; merge automation.

## Rule 1 — Ambient authority is denied before any Herdr execution

### Examples

1. Given an explicit environment snapshot with `HERDR_ENV: "1"`, a compatible doctor may invoke its exact probes.
2. Given missing `HERDR_ENV`, the doctor returns `unavailable/outside-herdr` and the executor call count remains zero.
3. Given `HERDR_ENV: "0"`, `"true"`, whitespace, a number, or an inherited accessor, the client returns a stable environment refusal without evaluating accessors or echoing values.
4. The library receives the environment snapshot as data and contains no reads of `process.env`, files, sockets, clocks, or global focus state.
5. A typed operation cannot run from a copied, reconstructed, or deserialized client-shaped value; only the process-local client instance returned by a successful doctor owns execution capability.

## Rule 2 — Compatibility is observed live and classified by the CMP-01 authority

### Examples

1. The doctor invokes exactly `herdr --version`, then `herdr api schema --json`, through the injected argv executor; neither probe uses a shell.
2. Version `0.8.0`, protocol `19`, and schema version `1` produce a compatible process-local client.
3. Version `0.8.9`, protocol `19`, and schema version `1` is compatible under the published 0.8.x policy.
4. Version `0.7.5` or `0.9.0` produces `unavailable/incompatible-runtime`; legacy fixtures do not widen runtime support.
5. Protocol `18` or `20` produces `unavailable/incompatible-protocol` even when the runtime version is 0.8.x.
6. Schema version `2` produces `unavailable/incompatible-schema` even when the runtime and protocol match.
7. Missing or malformed version/protocol/schema observations produce `unavailable/compatibility-unknown`; they never silently use expected constants as observed values.
8. Schema output over 512 KiB, version output over 4 KiB, or either probe marked timed out/aborted produces the corresponding bounded typed outcome and no partial client.

## Rule 3 — Every command is deterministic argv and never an interpolated shell

### Examples

1. Agent list builds exactly `["herdr", "agent", "list"]`.
2. Agent get, agent read, and agent wait require an explicit validated target and place it in one argv element.
3. Worktree create requires explicit `cwd` and branch, emits `--no-focus`, never emits `--focus`, and relies on the default JSON envelope without adding `--json`.
4. Agent start emits an explicit name, `--kind`, pane id, bounded startup timeout, and optional native Pi arguments only after a literal `--` separator.
5. Agent prompt emits a single prompt argv element plus explicit wait/timeout options; shell metacharacters remain inert data inside that element.
6. Notification show emits only allowlisted position/sound values and never changes focus.
7. Semantically identical normalized inputs produce byte-for-byte identical deeply frozen argv arrays with a fixed option order.
8. No builder emits `sh`, `bash`, `zsh`, `-c`, command substitution, redirection, pipelines, or a single joined command string.

## Rule 4 — Runtime validation is bounded and hostile JavaScript shapes fail closed

### Examples

1. Agent names must match Herdr's `[a-z][a-z0-9_-]{0,31}` grammar; empty, uppercase, overlength, or leading-hyphen names are refused before execution.
2. Workspace/tab/pane targets are non-empty, control-free, at most 128 characters, and cannot begin with `-`; their internal syntax remains opaque rather than derived.
3. `cwd` and optional worktree path are absolute, normalized POSIX paths no longer than CON-01's 512-character path bound; structural validation makes no realpath/symlink claim.
4. Branch, base, label, title, and prompt values are non-empty, control/NUL-free, bounded, and rejected when a leading hyphen could be parsed as an option value.
5. Read lines are integers from 1 through 500; operation and wait timeouts are integers from 1 through 300,000 milliseconds.
6. Agent-start native arguments are a dense plain array of at most 64 non-empty strings, each within the command bound; sparse, accessor, symbol-keyed, subclassed, or throwing-proxy arrays are refused.
7. Prompt/body strings over 4,096 characters, notification titles over 256 characters, and aggregate argv beyond 16 KiB are refused with stable bound codes.
8. Unsupported objects, accessors, cycles, non-finite numbers, functions, symbols, bigints, and hostile reflection errors become stable non-echoing refusals.

## Rule 5 — Execution has one argv-only authority and explicit timeout/abort semantics

### Examples

1. A valid operation calls exactly one injected executor with a frozen argv array, a bounded process timeout, and the caller's optional abort signal.
2. An already-aborted signal returns `aborted` and invokes no executor.
3. An executor report with `aborted: true` returns `aborted`, regardless of exit code or output text.
4. An executor report with `timedOut: true` returns `timeout`, regardless of exit code or output text.
5. Herdr's nonzero JSON error `{ code: "timeout" }` also maps to `timeout`, never to completed or failed.
6. A signal/launch/transport failure becomes `unavailable/executor-failed` without exposing the thrown message, argv contents, or partial output.
7. Conflicting executor flags, such as both timed out and aborted, are refused as `invalid-executor-report` rather than resolved by precedence.
8. After timeout, abort, transport failure, or refusal, stdout cannot be parsed or promoted into a partial success.

## Rule 6 — JSON envelopes are operation-bound, bounded, detached, and immutable

### Examples

1. A successful CLI response must be a plain decoded object with exact outer `id` and a `result.type` allowed for the requested operation.
2. Malformed JSON, empty success output, an array root, or a primitive root produces `refused/malformed-envelope`.
3. A response id for another command or a result discriminant for another operation produces `refused/mismatched-envelope`.
4. Zero exit with an error envelope, nonzero exit with a success envelope, or simultaneous meaningful stdout/stderr produces `refused/inconsistent-executor-report`.
5. Ordinary operation stdout/stderr over 65,536 bytes is rejected before JSON parsing; the compatibility-schema probe uses only its explicit 512 KiB bound.
6. Unknown additive fields from a compatible schema-1 patch release are ignored while required fields are strictly projected into a new detached value.
7. Every accepted projection is deeply frozen; later mutations to executor reports, parsed input, or returned nested values cannot change evidence already emitted.

## Rule 7 — Agent lifecycle states remain semantically distinct

### Examples

1. `idle` and `done` produce completed outcomes while preserving the exact observed state; done is never relabeled idle.
2. `working` produces a `working` outcome, not completed.
3. `blocked` produces a `blocked` outcome with the validated agent identity, not a generic failure.
4. Herdr's valid `unknown` state produces an `unknown` outcome, never completed, failed, idle, or done.
5. A wait that reaches one requested state preserves that state and the explicit pane id in its typed result.
6. An unrecognized future status under schema 1 is conservatively mapped to `unknown` with no raw status echo.

## Rule 8 — Command-specific response invariants prevent cross-operation confusion

### Examples

1. Agent list accepts only `cli:agent:list` plus `result.type: "agent_list"`, validates at most 256 agents, and rejects duplicate pane ids.
2. Agent get and agent wait accept only `agent_info`, require a non-empty pane id, and prove the response matches the requested pane id or agent name.
3. Agent read accepts only `pane_read`, requires the requested pane id/source/format, bounds text bytes, and preserves Herdr's `truncated` boolean.
4. Worktree create accepts only `worktree_created` and requires the schema-1 `result.root_pane.pane_id`; missing pane id returns `refused/missing-pane-id`.
5. The typed 0.8 parser never falls back to legacy `result.pane` or `result.worktree` ids; fallback remains only in the legacy adapter.
6. Agent start accepts only `agent_started`, requires returned argv to be bounded strings, and requires the returned agent pane/name to match the request.
7. Agent prompt accepts only `agent_prompted` and classifies the returned agent state without treating blocked or unknown as success.
8. Notification show accepts only `notification_show`; `shown`, `disabled`, `rate_limited`, `no_foreground_client`, and `busy` remain distinct typed delivery reasons.
9. Worktree/list/read/agent response paths and identifiers are projected as display data only; they cannot grant writer leases or filesystem authority.

## Rule 9 — Error handling is stable, non-echoing, and never promotes partial values

### Examples

1. Nonzero stderr `{ code: "agent_not_found" }` maps to `unavailable/not-found` without its arbitrary message.
2. Nonzero stderr `{ code: "timeout" }` maps to `timeout`; the same word in arbitrary plaintext does not.
3. Unknown well-formed Herdr error codes map to `unavailable/cli-error` rather than becoming new caller-visible reason codes.
4. Empty/non-JSON nonzero stderr maps to `unavailable/cli-error`; stdout is discarded.
5. Error objects contain only stable package-owned codes and bounded operation metadata, never prompt text, labels, paths, argv, stderr messages, or raw envelopes.
6. Every refusal and unavailable outcome omits partial agent, pane, worktree, notification, and compatibility values.

## Rule 10 — Existing behavior remains available behind a serialized rollout seam

### Examples

1. Existing `/herd-task`, herd widget, footer, and source tests remain green without routing through the new typed client by default.
2. The new client is opt-in by explicit adapter injection; HDR-01 adds no ambient environment feature flag or persisted global setting.
3. Disabling/removing the injection returns immediately to the legacy adapter without changing worktrees, panes, or user configuration.
4. The CMP-01 compatibility test corpus remains unchanged; compatibility implementation may move to `lib/herdr` only with a behavior-preserving extension-path re-export.
5. Normalized 0.7.5 envelopes remain historical compatibility fixtures and are never accepted by the typed 0.8 command parser.
6. HDR-01 owns no cache: each operation uses one fresh executor report, while the existing widget's bounded stale-while-revalidate cache remains unchanged.

## Rule 11 — Integration ownership stays narrow and dependency-ordered

### Examples

1. HDR-01 publishes typed client, builder, parser, doctor, and outcome contracts; ISO-01 later consumes explicit worktree/pane ids and owns leases/collision policy.
2. ROLE-01 owns role/tool contracts; HDR-01 cannot decide which agent may run which command.
3. OPS-01 owns notifications, retries, focused resumes, cleanup, and user-owned pane lifecycle; HDR-01 only builds/parses notification operations.
4. FIT-01 owns canonical BDD/fitness integration; a Herdr operation outcome alone cannot authorize a required trusted gate.
5. SEC-01 owns live child containment; HDR-01 tests use injected executors and do not launch live fleet children.
6. OBS-01 owns persistence and must pass any later stored client output through RED-01; HDR-01 itself has no persistence sink.

## Rule 12 — Verification proves the failure modes, not only happy-path fixtures

### Examples

1. The causal red command is `cd pi && bun test tests/herd-client.test.ts` and must fail because a named parser/wait/argv contract is missing or misclassifies a locked fixture.
2. Focused green covers compatible doctor, all eight argv builders, typed envelopes, malformed/mismatched inputs, bounds, timeout, abort, blocked, unknown, and missing pane id.
3. Legacy `herd-compat`, `herd-task`, `herd-task-handler`, and `herd-source` suites pass unchanged alongside the new focused suite.
4. Mutation sensitivity changes timeout into completed/failed or permits a shell-wrapper argv; the named locked test must fail and restoration must pass.
5. Final verification runs `bash scripts/test-root.sh`, diff/whitespace scans, credential-literal scans, and an independent read-only adversarial review; visual verification is N/A for this pure non-visual library.

## Open questions and package decisions

| ID | Question | HDR-01 decision |
|---|---|---|
| Q1 | Where does environment authority come from? | The extension passes an explicit environment snapshot. `lib/herdr` never reads `process.env`; exact `HERDR_ENV === "1"` is required before probes or operations. |
| Q2 | Which compatibility probes are authoritative? | Exact argv `herdr --version` plus `herdr api schema --json`; status text and documentation are not runtime observations. |
| Q3 | How is the large schema probe bounded? | Version output ≤4 KiB; schema stdout ≤512 KiB and stderr ≤64 KiB. Ordinary command output remains ≤64 KiB. |
| Q4 | Is compatibility rechecked before every command? | A successful doctor creates one process-local client instance. Callers recreate it after Herdr reload/update or any protocol/transport error; no serialized compatibility token is trusted. |
| Q5 | Can callers omit targets or use focus/current state? | No. Every target-bearing builder requires an explicit validated id/name; builders expose no implicit-focus or `--current` mode. |
| Q6 | What are V1 read and timeout bounds? | Lines 1–500; timeouts 1–300,000 ms; native args ≤64; aggregate argv ≤16 KiB. |
| Q7 | Does path validation prove the filesystem target? | No. It is structural absolute-POSIX validation only. ISO-01/SEC-00 later own realpath, symlink, hardlink, and ownership checks. |
| Q8 | How are lifecycle states represented? | Distinct top-level outcomes preserve idle/done/working/blocked/unknown semantics; timeout and abort are separate non-boolean outcomes. |
| Q9 | Can text such as “timed out” determine timeout? | No. Only explicit executor flags or a validated Herdr JSON error code `timeout` can do so. |
| Q10 | Are Herdr error messages exposed? | No. Package-owned stable codes only; arbitrary messages and partial values are discarded. |
| Q11 | Are additive fields accepted? | Yes, only after protocol/schema compatibility passes. Required fields are strict and projected; extra fields never enter returned evidence. |
| Q12 | Does worktree creation retain legacy pane-id fallback? | Not in the typed client. Schema-1 `root_pane.pane_id` is mandatory; the legacy adapter alone retains tolerant fallback. |
| Q13 | Does HDR-01 decide when to notify? | No. It validates/builds/parses notification-show only. OPS-01 owns policy, rate, focus, and user experience. |
| Q14 | Where is the rollout flag stored? | No ambient/persisted flag is introduced. Typed behavior is opt-in through explicit adapter injection; absence means legacy behavior. |
| Q15 | Who owns process spawning and timers? | One injected argv executor. HDR-01 passes timeout/signal data but owns no child process, timer, shell, or socket. |
| Q16 | What is the primary mutation target? | Reclassify timeout as completed/failed or introduce a shell wrapper; the locked named test must fail. |
| Q17 | Can the client grant leases, approvals, or gate passes? | No. It emits typed observations only; ISO-01, APR-01, and FIT-01 own those authorities. |
| Q18 | Where will CMP-01 compatibility code live? | Prefer `lib/herdr/compat.ts` with an extension-path re-export only if the existing corpus remains byte-for-byte behavior compatible; otherwise reuse the frozen source without duplication. |
| Q19 | Is live Herdr acceptance required? | A read-only installed-binary doctor/list/get/wait-timeout probe may confirm fixtures in verify; no worktree, agent, notification, focus, or pane mutation is permitted. |
| Q20 | Can JavaScript Proxies be proven absent? | Throwing/reflection-hostile and visibly exotic shapes are refused. A transparent non-throwing Proxy is indistinguishable from its target in JavaScript; trust remains at the decoded/injected boundary. |

## Coverage summary

- **Rules:** 12
- **Examples:** 82
- **Questions:** 20
- **Primary mutation:** timeout classification or argv shell-boundary removal
- **Focused test:** `cd pi && bun test tests/herd-client.test.ts`
- **Root regression:** `bash scripts/test-root.sh`
