# Post-PR merge command cheat sheet

## Resolve main checkout vs worktree

```bash
git worktree list --porcelain
# Main = first worktree; worktrees usually under .worktrees/ or .claude/worktrees/
```

## PR meta (optional but preferred)

```bash
gh pr view --json number,state,headRefName,baseRefName,mergedAt,url
gh pr view <N> --json number,state,headRefName,baseRefName,mergedAt,url
```

## Update base

```bash
git fetch origin
git checkout develop   # or main
git pull --ff-only origin develop
```

## Worktree removal

```bash
git worktree remove --force path/to/worktree
rm -rf path/to/worktree   # only if git worktree remove left a dirty dir
git worktree prune
```

## Branch deletion

```bash
git branch -D feature/xyz
git push origin --delete feature/xyz   # ok if already deleted
git fetch --prune
```

## Merged-into-base check

```bash
git merge-base --is-ancestor feature/xyz origin/develop && echo merged
# or
git branch --merged origin/develop
```

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
