# Post-PR merge command cheat sheet

## Authoritative persistent cleanup driver

Do not copy lock snippets into another shell. Run every Phase 1–6 operation as one child of the bundled driver:

```bash
COMMON_RAW=$(git rev-parse --git-common-dir)
case "$COMMON_RAW" in /*) GIT_COMMON="$COMMON_RAW" ;; *) GIT_COMMON="$(pwd)/$COMMON_RAW" ;; esac
GIT_COMMON=$(cd "$GIT_COMMON" && pwd -P)

# cleanup-plan.sh must perform identity recheck, Phases 1–6, and final verification.
scripts/cleanup-lock-driver.sh --git-common-dir "$GIT_COMMON" -- \
  bash /absolute/path/to/cleanup-plan.sh
```

The driver is the sole lock implementation. An atomic ready-file handshake publishes the dedicated child process-group ID before cancellation can release ownership. Startup `INT`/`TERM` waits for readiness or proven launcher exit, signals the whole known group, and verifies all descendants are gone before release. If readiness or quiescence cannot be proven it retains the lock and exits 75. Never split phases across driver invocations.

## Identity fence before destructive cleanup

```bash
: "${PR_NUMBER:?}" "${EXPECTED_HEAD_SHA:?}"
PR_JSON=$(gh pr view "$PR_NUMBER" \
  --json number,url,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit)
test "$(jq -r .state <<<"$PR_JSON")" = MERGED
test "$(jq -r .headRefOid <<<"$PR_JSON")" = "$EXPECTED_HEAD_SHA"
test "$(jq -r '.mergeCommit.oid // empty' <<<"$PR_JSON")" != ""
```

Repeat this query immediately before worktree/branch deletion. Mismatch is `stale/overtaken`; API failure is `unknown`. Both stop cleanup.

## Resolve main checkout and update base

```bash
git worktree list --porcelain
# Main = first worktree. Run the cleanup plan from that surviving checkout.
git fetch origin
git checkout "$BASE"
git pull --ff-only origin "$BASE"
```

## Remove only exact finalized handoffs

For `FEATURE_WORKTREE` and optional neutral `REVIEW_FIX_WORKTREE`, verify each path is registered, non-main, not current cwd, clean, on its handed-off branch, and `HEAD == EXPECTED_HEAD_SHA`.

```bash
for path in "$FEATURE_WORKTREE" "${REVIEW_FIX_WORKTREE:-}"; do
  [[ -n "$path" ]] || continue
  git worktree list --porcelain | grep -Fqx "worktree $path" || exit 75
  test "$(pwd -P)" != "$(cd "$path" && pwd -P)" || exit 75
  test -z "$(git -C "$path" status --porcelain)" || exit 75
  test "$(git -C "$path" rev-parse HEAD)" = "$EXPECTED_HEAD_SHA" || exit 75
done
git worktree remove --force "$FEATURE_WORKTREE"
[[ -z "${REVIEW_FIX_WORKTREE:-}" ]] || git worktree remove --force "$REVIEW_FIX_WORKTREE"
git worktree prune
for branch in "$FEATURE" "${REVIEW_FIX_LOCAL_BRANCH:-}"; do
  [[ -n "$branch" ]] || continue
  git show-ref --verify --quiet "refs/heads/$branch" && git branch -D -- "$branch"
done
```

Also compare `git -C "$REVIEW_FIX_WORKTREE" branch --show-current` with `REVIEW_FIX_LOCAL_BRANCH` before removal. Other merged branches require explicit request + preview + confirmation.

## Remote deletion classification

Use the exact Git remote, credentials, and full branch ref for both discovery and verification. `git ls-remote --exit-code` classifies exit 0 as present, exit 2 as absent, and every other exit as unknown.

```bash
REMOTE_REF="refs/heads/$FEATURE"
LS_REMOTE_OUT=$(mktemp); LS_REMOTE_ERR=$(mktemp)
classify_remote_feature() {
  local rc
  set +e
  git ls-remote --exit-code --heads origin "$REMOTE_REF" >"$LS_REMOTE_OUT" 2>"$LS_REMOTE_ERR"
  rc=$?
  set -e
  case "$rc" in
    0) printf '%s\n' exists ;;
    2) printf '%s\n' absent ;;
    *) printf '%s\n' unknown ;;
  esac
}

REMOTE_BEFORE=$(classify_remote_feature)
case "$REMOTE_BEFORE" in
  absent)
    REMOTE_DELETE=absent
    ;;
  unknown)
    cat "$LS_REMOTE_ERR" >&2
    REMOTE_DELETE=unknown
    ;;
  exists)
    # Delete only after exact-ref discovery proved that this branch exists.
    set +e
    git push origin -- ":$REMOTE_REF"
    PUSH_RC=$?
    set -e
    REMOTE_AFTER=$(classify_remote_feature)
    case "$REMOTE_AFTER" in
      absent) REMOTE_DELETE=success ;;
      exists) REMOTE_DELETE=failure ;;
      unknown) REMOTE_DELETE=unknown ;;
    esac
    (( PUSH_RC == 0 )) || cat "$LS_REMOTE_ERR" >&2
    ;;
esac
rm -f "$LS_REMOTE_OUT" "$LS_REMOTE_ERR"
case "$REMOTE_DELETE" in
  absent|success) git fetch --prune ;;
  failure) exit 1 ;;
  unknown) exit 75 ;;
esac
```

Never infer branch absence from GitHub metadata or an API 404. Do not delete unless the exact `origin` branch lookup returned 0, and do not report success until the same lookup returns 2.

## Conditional Herdr handoff

When Herdr is active, delegate report schema, writer quiescence, and stale-pane handling to `herdr-delivery-supervisor`. Do not duplicate that schema here.

---

## Process audit (memory / battery)

### Snapshot leftovers

```bash
ps -axo pid,pcpu,pmem,rss,etime,command | rg -i \
  'next-server|next dev|bun run dev|visual-|tmp-visual|v[0-9]+-|agent-browser|dev-browser|playwright|chromium|cloudflared|megazord' \
  | rg -v 'rg -i'

# Sort by CPU among user processes (optional)
ps -axo pid,pcpu,pmem,rss,etime,command | sort -k2 -nr | head -25
```

### Listening ports

```bash
lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | rg ':(3000|3001|3010|3011|4000|5173|8080|9222)\b'
# Who owns a port:
lsof -iTCP:3000 -sTCP:LISTEN -P -n
```

### Match processes to a worktree path

```bash
WORKTREE=".worktrees/feat/2450-list-mode-filters-sort-chips"   # example
pgrep -fl . | rg -F "$WORKTREE" || true
# Also match next-server children that only show "next-server (v…)" — walk parents:
ps -axo pid,ppid,command | rg 'next-server|next dev|bun run dev'
```

### Count noise (optional)

```bash
echo -n "node: "; pgrep -c node || true
echo -n "bun: "; pgrep -c bun || true
echo -n "next-server: "; pgrep -c next-server || true
```

---

## Process kill recipes

### Kill by PID (prefer process group)

```bash
PID=12345
# Kill whole group (parent + turbopack/postcss children)
PGID=$(ps -o pgid= -p "$PID" | tr -d ' ')
kill -- -"$PGID" 2>/dev/null || kill "$PID"
sleep 2
kill -9 "$PID" 2>/dev/null || true
```

### Tier A — stuck visual / tmp bun scripts

Patterns seen in the wild (always safe to kill after a task):

- `bun /tmp/visual-*.mjs`
- `bun /tmp/visual-*-analytics-*.mjs`
- `bun tmp-visual-*.mjs`
- `bun tmp/visual-*.mjs`
- `bun tmp/v2450-*.mjs` (issue-prefixed one-shots)

```bash
# List candidates
ps -axo pid,etime,command | rg 'bun .*(/tmp/visual|tmp-visual|tmp/visual|tmp/v[0-9])' | rg -v rg

# Kill each PID (or its PGID)
for pid in $(ps -axo pid=,command= | rg 'bun .*(/tmp/visual|tmp-visual|tmp/visual|tmp/v[0-9])' | awk '{print $1}'); do
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  kill -- -"$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
done
sleep 1
# Force any survivors
for pid in $(ps -axo pid=,command= | rg 'bun .*(/tmp/visual|tmp-visual|tmp/visual|tmp/v[0-9])' | awk '{print $1}'); do
  kill -9 "$pid" 2>/dev/null || true
done
```

### Tier A/B — next dev bound to a worktree

```bash
# Example: worktree path fragment
FRAG="feat/2450-list-mode-filters-sort-chips"

ps -axo pid,ppid,command | rg -F "$FRAG"
# Parent is often: bun run dev → node …/next dev → next-server
# Kill the top-most bun/node in that tree (PGID), not only next-server.

# Port-based (when you know this task owned :3000)
lsof -iTCP:3000 -sTCP:LISTEN -P -n -t | while read pid; do
  kill -- -$(ps -o pgid= -p "$pid" | tr -d ' ') 2>/dev/null || kill "$pid"
done
```

### Tier A — automation browsers only

```bash
# Prefer specific automation markers — NOT "Google Chrome" / Firefox.app daily use
ps -axo pid,command | rg -i 'agent-browser|dev-browser|ms-playwright|playwright_chromium|headless_shell|chromium_headless' | rg -v rg

# Example kill
# kill <pid>
```

### Tier B — duplicate cloudflared

```bash
pgrep -fl cloudflared
# If two+ `cloudflared tunnel run` for the same tunnel, keep the newest (or the one still needed)
# kill <older-pid>
# NEVER print full --token values in chat; redact.
```

### Forbidden

```bash
# DO NOT:
killall node
killall bun
killall "Google Chrome"
pkill -f node
```

---

## Temp artifact cleanup

```bash
rm -f /tmp/visual-*.mjs /tmp/tmp-visual-*.mjs 2>/dev/null || true

# Repo-local one-shots only if untracked and from this task:
# git status --short tmp/
# rm -f tmp/visual-*.mjs tmp/v*-*.mjs tmp-visual-*.mjs
```

---

## Re-audit after kill

```bash
ps -axo pid,pcpu,pmem,etime,command | rg -i \
  'next-server|next dev|bun run dev|visual-|tmp-visual|agent-browser|dev-browser' \
  | rg -v 'rg -i' || echo "No leftover task processes found."

lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | rg ':(3000|3001|3010|3011)\b' \
  || echo "No app ports 3000/3010 listening."
```
