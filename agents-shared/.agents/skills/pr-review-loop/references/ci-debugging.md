# CI Debugging

How to inspect, reproduce, and fix CI failures on a PR. Use after `gh pr checks <pr>` reports a non-success conclusion.

## Triage flow

```
gh pr view <pr> --json headRefOid,statusCheckRollup
+ gh pr checks <pr> --required
  ├─ all required success for candidate SHA → continue to final rediscovery
  ├─ any pending → wait (see "Waiting strategy" below)
  ├─ any failure → diagnose
  └─ timeout/transport/rate-limit/partial result → unknown; keep merge frozen
```

## Diagnose a failure

### 1. Identify the failing run + job

```bash
gh pr checks <pr> --json name,state,bucket,link,workflow
# Note the failing check link; Actions URLs contain the run and job IDs.
# Bind the conclusion to an unchanged headRefOid via statusCheckRollup/check-runs.
```

For matrix workflows, the failing check is often one cell — list jobs:

```bash
gh run view <RUN_ID> --json jobs -q '.jobs[] | select(.conclusion == "failure") | {name, databaseId}'
```

### 2. Pull only the failed-step logs

```bash
gh run view <RUN_ID> --log-failed | tail -300
# or for a specific job
gh run view --job <JOB_DB_ID> --log-failed | tail -300
```

Avoid `gh run view --log` without filters — it dumps everything (often >100 MB) and floods context.

### 3. Classify the failure

| Pattern in logs | Likely cause | Action |
|----|----|----|
| `error TS\d+:` | TypeScript regression | Reproduce locally with `bunx tsc --noEmit`; the failing file is in the diff |
| `FAIL tests/...`, `expected X received Y` | unit test regression | Run that test file locally; likely caused by your changes |
| `Error: Cannot find module` | missing dep / lockfile drift | Run `bun install` locally; ensure lockfile is committed |
| `Out of memory`, `JavaScript heap out of memory` | flaky resource limit | Re-run; if persistent, increase node `--max-old-space-size` or split work |
| Test passes locally, fails in CI | env-dep, race, or platform diff | See "Local-only-pass diagnosis" below |
| Network timeout to external service | flake | Re-run via `gh run rerun <RUN_ID> --failed` |
| Pre-existing failure on `main` | not your problem | Verify by running `gh run list -b main -L 5`; brief the user |

### 4. Reproduce locally

Always reproduce before "fixing." Common pitfalls:

```bash
# In your worktree
bun install                                    # match CI lockfile
bun test path/to/specific.test.ts              # narrow scope
bunx tsc --noEmit                              # full typecheck
```

If you can't reproduce, check:
- Node / Bun / Python version skew (`gh workflow view <name>` shows the matrix)
- Linux-vs-macOS divergence (the host CLAUDE.md `bun-cross-platform-testing` rule covers this for olhaminha.bio)
- Missing env vars (CI may set things you don't have locally — `gh workflow view` again)

## Local-only-pass diagnosis

The most common gotcha: tests pass on macOS, fail on Linux CI. Possible causes:
- `mock.module('@/...')` works on macOS bun, silently fails on Linux bun
- File-system case sensitivity (Linux is case-sensitive, macOS usually isn't)
- Time-zone or locale differences in date parsing
- Race conditions surfaced by faster CI hardware
- **Free identifiers `sessionStorage` / `localStorage`**: Linux Bun does **not** bind bare names to `globalThis` values set in `test-setup.ts` preload. Symptom: `ReferenceError: sessionStorage is not defined` only on CI. Fix production code to use `globalThis.sessionStorage` / `globalThis.localStorage` (null-safe), not “skip the test.”
- **Pre-push / CI context suite blast radius**: touching `tests/features/_generated/**` can re-run many acceptance files; a red test may be **stale copy** elsewhere, not your feature.

The fix is usually to harden the code or the test, not to make CI more lenient.

## Waiting strategy

If a check is `pending`, don't sleep blindly. Pick a bounded delay that matches the typical run length:

```bash
# Short typecheck/lint runs (≤2 min) — use the bounded SECONDS polling
# loop in gh-commands.md, then immediately rediscover headRefOid/statusCheckRollup.

# Longer test/build runs (5–15 min) — wait then poll once
sleep 600 && gh pr checks <pr>

# Full E2E suites (20+ min) — recommend the user re-invoke later
```

Don't burn cache windows on `sleep 300` — it's the worst-of-both default. Either go shorter (in-cache poll) or longer (one cache miss buys a real wait).

After any wait, re-query `headRefOid,statusCheckRollup`. If the watch/tool/operator timeout expires, the result is **unknown**—neither red nor green. If the head SHA changed, discard conclusions for the old SHA and restart discovery.

## Re-running after a fix

After pushing a fix commit, the existing checks invalidate and new ones queue. Don't manually re-run unless the failure was a flake — the new commit triggers fresh runs automatically.

To force a re-run of just the failed jobs (e.g. for a flake confirmation):

```bash
gh run rerun <RUN_ID> --failed
```

To re-run an entire workflow:

```bash
gh run rerun <RUN_ID>
```

## When the failure is in someone else's PR

A check failure caused by a merge conflict, a base-branch break, or a dependency you didn't touch isn't yours to fix in this PR. Note it in a reply to the user, suggest a separate branch for the fix, and continue closing out the in-scope feedback.
