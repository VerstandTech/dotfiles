# SEC-PATH-01 Example Map — Explicit operator-requested local paths

Issue: [#31](https://github.com/codingleo/dotfiles/issues/31)
Focus: Allow an explicit user-requested local path through host/path sandbox and result redaction without weakening RED-01.

## Story

As Leo using Pi on a real machine,
I want a local file I just named in this turn to be readable,
so ordinary operator-requested plans, pane dumps, and home/Downloads files stay usable while unsolicited paths and secrets remain fail-closed.

## Personas

- **Leo — local operator (primary):** just typed an exact path such as `~/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md`. He expects that one file to come back readable, not `File access blocked` or `security-policy: content-redaction-refused`.
- **Nikhil — security reviewer:** any extra path authority must be current-turn, exact, and non-ambient. HOME/Downloads must not become allowlists. Secrets, accessors, and hostile objects must still refuse without echo.
- **André — extension maintainer:** path approval is a closed fact on the current-turn request, not a project file, model boolean, tool-name allowlist, or context-mode settings grant.
- **Sofia — product engineer:** if only auxiliary details are unsafe or oversized, the requested primary content must remain visible with a stable details-refusal marker.

## Confusion / recovery

| Confusion | Wrong mental model | Recovery the product must force |
|---|---|---|
| "I named the file, so it should just work" | Any later tool can reopen `~/Downloads` | Only the exact path from the current user turn is approved; a later guessed sibling stays blocked |
| "Downloads is trusted" | Directory allowlist | Directory membership never grants authority |
| "Interactive can skip sandbox" | Profile weakening | `interactive`, `strict`, and `overnight` stay unchanged; this is current-turn path matching only |
| "`content-redaction-refused` means a secret leaked" | Opaque whole-result refusal | Primary requested content stays if it is independently safe; only unsafe/oversized auxiliary details degrade |
| "If the file is missing, invent it" | Fabricated evidence | Unavailable paths stay unavailable; no synthesized file bytes |

## Rules and examples

### R1 — Current-turn exact path is the only extra read authority

- E1: user turn contains `/Users/operator/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md` and a read asks for that same resolved path → permit (subject to secret-leaf and RED-01).
- E2: user turn contains `~/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md` and facts resolve to the same home file → permit.
- E3: user turn contains that path, but the read asks for `/Users/operator/Downloads/other.md` → `read-outside-authority`.
- E4: user turn contains a directory `/Users/operator/Downloads` and the read asks for a file under it → deny. Directory text is not path approval.
- E5: user turn contains the path inside a fence or after "read this file:" → still counts as explicit current-turn supply.
- E6: previous turn named the path, current turn did not → deny. Approval is not sticky across turns.

### R2 — Unsolicited paths outside worktree/session-temp stay denied

- E7: no user-turn path, read of `/Users/operator/Downloads/plan.md` → `read-outside-authority`.
- E8: no user-turn path, read of `/tmp/arbitrary.txt` that is not the session temp root → `read-outside-authority`.
- E9: no user-turn path, ordinary worktree file remains permitted as today.
- E10: no user-turn path, exact session-temp file remains permitted as today.
- E11: model/tool proposes a home path the user did not type → deny.
- E12: project file, settings.json, or AGENTS.md lists a home path → that listing cannot mint approval.

### R3 — Approval is exact, resolved, and non-forged

- E13: requestedPath and resolvedPath must both equal the operator-approved resolved path.
- E14: lexical lookalike with `..`, alternate slash, or trailing slash mismatch → `invalid-path` / `invalid-path-facts`, not a permit.
- E15: symlink from the approved path to another home file → `symlink-denied`.
- E16: hardlink (`linkCount > 1`) → `hardlink-denied`.
- E17: approved path whose realpath escapes to a secret leaf → `secret-read-denied`.
- E18: stale path facts (`factsCurrent: false`) → `path-authority-stale`.

### R4 — No ambient authority and no profile weakening

- E19: evaluator reads no filesystem, env, network, clock, or HOME to invent approved paths. Approved paths arrive as closed request facts.
- E20: project/model boolean `allowHomeReads: true` is ignored / invalid input.
- E21: interactive still cannot satisfy strict/overnight evidence.
- E22: strict still requires a current sandbox capability.
- E23: overnight still requires current successful security-gate slots.
- E24: no blanket HOME or Downloads allowlist exists in policy, capability observations, or context-mode settings.

### R5 — Secret-shaped requested content still refuses

- E25: operator-requested file whose basename is a credential leaf (`.env`, `id_ed25519`, `credentials.json`) → `secret-read-denied` before content is returned.
- E26: operator-requested ordinary markdown whose body contains an authorization header → RED-01 redacts the secret and returns the rest.
- E27: operator-requested body that is an unredactable hostile object / cycle / accessor → `security-policy: content-redaction-refused` with no source bytes.
- E28: operator-requested body that is binary → same stable content refusal, no preview.
- E29: refusal codes do not echo the secret, path preview, exception message, or provider text.
- E30: RED-01 remains the sole byte-redaction authority. Path approval cannot skip `redactForPersistence`.

### R6 — Hostile / accessor objects still refuse

- E31: content getter / proxy trap on the primary channel → `content-redaction-refused`, getter never invoked.
- E32: details getter / proxy trap → primary content remains; details become `{securityPolicy:{ok:false,code:"details-redaction-refused"}}`.
- E33: cyclic details → same details-only refusal; primary content remains.
- E34: mixed envelope (channel + legacy keys) → whole-result `redaction-refused`.
- E35: malformed `isError` authority → cannot normalize to success.
- E36: tool-name allowlist still does not exist; `read` / `bash` / `ctx_execute` get no extra privilege.

### R7 — Oversized auxiliary details degrade; requested primary content stays

- E37: safe operator-requested primary content + oversized details → primary visible; details refused with `details-redaction-refused`.
- E38: safe primary content + binary/cycle/accessor details → same isolation.
- E39: primary content itself exceeds RED-01 string/input/output bounds → `content-redaction-refused`. This issue does not raise RED-01 string limits.
- E40: dual near-limit channels that overflow only in aggregate → drop details, keep primary, no retry/truncation loop.
- E41: both channels independently unsafe → one stable non-echoing refusal.
- E42: details refusal does not flip a successful safe primary result into a tool failure.

### R8 — Host / context-mode containment stays deny-by-default

- E43: context-mode / host Read of an unsolicited absolute path outside the project still returns the stable blocked code (`File access blocked` / outside project root).
- E44: the same host Read of the exact current-turn operator path is allowed through containment. This is not a Claude-settings HOME glob.
- E45: a project `.claude/settings.json` allow rule cannot mint SEC-01 path approval.
- E46: if the host still cannot see the file, the agent reports unavailability. It does not fabricate contents.
- E47: host permission for one exact file does not grant sibling files in that directory.
- E48: writes remain unchanged: operator-requested home paths do not become writable.

### R9 — Unavailable paths stay honest

- E49: approved path that does not exist → not-found / unavailable, not a synthesized document.
- E50: approved path that exists but is unreadable for OS reasons → stable error, no guessed bytes.
- E51: evidence, handoff, or issue text cannot claim a file was read if the read was blocked or missing.
- E52: previous CLOSE-01 leftover (`GRAPHITI_PI_HERDR_MEMORY_PLAN.md`) is the motivating example, not a special-cased filename.

## Questions

- Q1: Does a `~/Downloads/**` allowlist satisfy this issue? **No.** Exact current-turn path only.
- Q2: Can a project file or model boolean mint path approval? **No.**
- Q3: Does approval persist to the next user turn? **No.**
- Q4: Does naming a directory approve every child? **No.**
- Q5: Does this weaken `interactive` / `strict` / `overnight`? **No.**
- Q6: Does path approval bypass RED-01? **No.**
- Q7: If details are oversized, may primary content be hidden? **No.**
- Q8: If primary content is secret-shaped or hostile, may it be returned raw? **No.** Stable non-echoing refusal.
- Q9: If the file is missing after approval, may we invent it? **No.**
- Q10: Are writes to operator-requested home files in scope? **No.**
- Q11: Is context-mode Claude `Read(~/Downloads/**)` the intended host fix? **No.** Exact current-turn path, deny-by-default otherwise.
- Q12: Causal red identifiers? **`SECPATH01_OPERATOR_REQUESTED_READ`**, **`SECPATH01_UNSOLICITED_OUTSIDE_DENIED`**, **`SECPATH01_SECRET_STILL_REFUSED`**, **`SECPATH01_HOSTILE_STILL_REFUSED`**, **`SECPATH01_OVERSIZED_DETAILS_DEGRADE`**.

## Out of scope

- Raising RED-01 `maxStringLength` / byte budgets as a substitute for path precision.
- Blanket HOME, Downloads, or `/tmp` allowlists.
- Ambient filesystem reads to discover what the user "probably meant".
- Changing write, command, egress, or overnight gate policy.
- Fabricating missing local plan files.
- Editing generated Rulesync outputs.

## Causal reds required by #31

1. Operator-requested Downloads/home file is readable.
2. Unsolicited path outside the project remains blocked.
3. Secret-shaped content still refuses.
4. Accessor / hostile objects still refuse.
5. Oversized auxiliary details degrade without hiding the requested primary content.
