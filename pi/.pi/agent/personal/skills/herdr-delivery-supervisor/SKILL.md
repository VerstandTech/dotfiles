---
name: herdr-delivery-supervisor
description: >
  Supervise Pi delivery workers inside Herdr with deterministic prompt/wait/get/read
  handoffs, bounded timeout recovery, one-owner shared-resource serialization, explicit
  model/context budgets, and safe pane/worktree lifecycle. Use only when the user asks
  for Herdr-based implementation, review, PR finalization, cleanup, or worker supervision.
  Requires a Herdr-managed caller (HERDR_ENV=1) and the Pi agent kind.
---

# Herdr Delivery Supervisor

Coordinate; do not duplicate worker implementation. Keep one writer per checkout/worktree and one owner per shared resource.

## Preconditions

1. Load the **`herdr`** skill and follow its safety rules.
2. Require `HERDR_ENV=1`; otherwise stop.
3. Inspect the installed CLI (`herdr --help`, `herdr agent`, relevant `herdr pane` group). The installed binary is authoritative.
4. Capture caller workspace/tab/pane IDs. Use explicit IDs or unique agent names; never rely on UI focus. Apply `--no-focus` to background pane creation/splits, not to `agent start` unless the installed help explicitly supports it.

## Budget before spawning

Write a worker contract before creating a pane:

```text
objective: one bounded deliverable
owned paths/worktree: exact scope
forbidden: unrelated paths, merge, shared-main cleanup, destructive git
model: <provider/model>
thinking: <off|minimal|low|medium|high|xhigh|max>
tool scope: minimum needed
context budget: checkpoint at 60%, stop/compact before 80%
wall timeout: <milliseconds>
max follow-up resumes: 2
report: commands, changed paths, tests, SHA/evidence, blockers, residual risks
```

Start Pi with the chosen model/thinking flags after Herdr's `--` separator, for example:

```bash
herdr agent start "$NAME" --kind pi --pane "$PANE" -- \
  --model "$MODEL" --thinking "$THINKING"
```

Add a narrow `--tools` allowlist for read-only/reviewer workers. Pi has no hard per-session context-cap flag; enforce context through bounded scope, prompt checkpoints, wall time, and at most two follow-ups. Ask the worker to report usage/checkpoint before compaction when the task is large.

## Shared-resource ledger

Before prompting, record owners for:

- writable checkout/worktree
- main checkout + git worktree registry
- branch/PR mutation
- stow target or installation tree
- dev-server port, tunnel, browser profile, emulator
- post-merge cleanup lock

Never schedule two owners for the same resource. Parallelize read-only discovery, not writers. Serialize final pushes, thread mutations, main-checkout cleanup, stow/restow, ports, and browser profiles. A worker may prepare a cleanup report but must not delete its own cwd.

## Mandatory prompt → wait → get → read sequence

Use separate commands so each state transition is inspectable:

```bash
herdr agent prompt "$NAME" "$PROMPT"
herdr agent wait "$NAME" --timeout "$TIMEOUT_MS"
herdr agent get "$NAME"
herdr agent read "$NAME" --source recent-unwrapped --lines 160
```

Always run `get` and `read`, even when wait returns `done`. `done` means settled unseen work, not that the supervisor captured or validated the report. `idle` may still have an incomplete answer. `blocked` requires inspection before input. `unknown` is not completion.

If terminal scrollback cannot recover the full response, ask the worker to write the complete Markdown report to a temporary file and reply with only its path; then read that file. Do not require file output in the initial prompt.

## Timeout and bounded resume

A wait timeout is **unknown**, not worker failure or completion.

1. On timeout/error, immediately run `agent get` and `agent read`.
2. If state is still `working` and output shows progress, allow one additional bounded wait; do not send a duplicate prompt.
3. If `blocked`, answer only the observed question/approval under the worker contract.
4. If settled but incomplete, send one focused follow-up containing the missing fields and wait/get/read again.
5. Allow at most **two** follow-up prompts total.
6. If bounded waits/resumes are exhausted while a **writer** is still active, send `herdr agent send-keys "$NAME" ctrl+c`, then perform one bounded `wait → get → read` inspection cycle.
7. Release checkout/shared-resource ownership only after `agent get` proves explicit `idle` (or the installed CLI proves the agent exited/absent) and the transcript shows the write/tool activity stopped. `working`, `blocked`, `unknown`, an unverified `done`, timeout, or unread output is not quiescence.
8. If idle/exited cannot be proven, retain the ownership/cleanup lock, prohibit worker replacement and post-merge cleanup for that resource, and report human intervention required.
9. Never revive an agent into a deleted worktree or after its ownership was transferred.

A resume prompt must restate current SHA/resource ownership and the exact missing result. Do not resend the original broad task. `ctrl+c` is cancellation, not permission to assume termination.

## Delivery and evidence checks

Before accepting a worker report:

- Read changed paths and ensure they stay in ownership.
- Distinguish local pass, replacement CI evidence, timeout/unknown, and not-run.
- Bind PR/visual/CI/thread evidence to the reported SHA only when `git status --porcelain` is empty. Otherwise record `dirty@SHA` plus exact paths; it is non-passing and cannot authorize final handoff or ownership transfer.
- If the worker pushed, re-run final discovery for the new SHA.
- Require explicit residual risks; silence is not `none`.

For PR delivery, route open-PR readiness through shared `pr-finalization`. Do not merge automatically. After confirmed merge, route cleanup through shared `post-pr-merge`.

## Pane and worktree lifecycle

Track whether each pane is supervisor-created or user-owned.

A worker in a worktree scheduled for deletion must first emit:

```text
READY_FOR_SUPERVISOR_CLEANUP
pane: <id>
worktree: <absolute path>
local branch: <name or detached>
PR: <number/url/state>
EXPECTED_HEAD_SHA: <finalized clean candidate>
observed PR head SHA: <sha>
merge commit SHA / mergedAt: <values>
dirty paths: <none or exact list>
task processes/ports: <values>
writer state: <idle or exited evidence>
```

Then it makes no further filesystem calls in that worktree. Transfer cleanup ownership only when the report proves clean git status, matching expected SHA, and idle/exited writer state. Otherwise retain ownership/lock and block cleanup or replacement.

After deletion:

- Close a supervisor-created stale pane after preserving its report; or
- If retaining it, ensure the Pi agent exited and the pane is an available shell. Use the installed `herdr pane` help to run/send `cd <surviving-cwd>` in that pane, then verify cwd with pane output. Do not invent a `rehome` subcommand.
- Never close/rehome a user-owned pane without permission.
- Never leave a live pane rooted in a removed directory.

## Supervisor report

Return:

- workers/panes/models and ownership
- prompt/wait/get/read results, including timeouts and resumes used
- changed paths and validation evidence by SHA
- serialized resources and lock ownership
- PR finalization/merge state
- pane outcome: retained, rehomed, or closed
- blockers and residual risks
