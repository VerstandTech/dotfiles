# Intensive engineering — worktree setup (Phase 0a)

Canonical isolation step before scope/BDD. **Skip entirely when already in a linked worktree** (same session re-entry, “fix all”, continued intensive work).

## Detect linked worktree

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
SUPER=$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)

if [ -z "$SUPER" ] && [ -n "$GIT_DIR" ] && [ -n "$GIT_COMMON" ] && [ "$GIT_DIR" != "$GIT_COMMON" ]; then
  echo "ALREADY_ISOLATED path=$(pwd) branch=$(git branch --show-current 2>/dev/null)"
else
  echo "MAIN_CHECKOUT — create worktree"
fi
```

Submodules also have `GIT_DIR != GIT_COMMON` — empty `SUPER` is required to treat the cwd as a worktree.

## Resolve base branch

```bash
# Prefer: issue/PR baseRefName if known
if git show-ref --verify --quiet refs/remotes/origin/develop || git show-ref --verify --quiet refs/heads/develop; then
  BASE=develop
elif git show-ref --verify --quiet refs/remotes/origin/main || git show-ref --verify --quiet refs/heads/main; then
  BASE=main
else
  BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
  BASE=${BASE:-main}
fi
```

For olhaminha.bio / lookmybio monorepos, default **base is `develop`**.

## Branch + path

```bash
FEATURE="feat/<kebab-slug>"   # or fix/ | chore/
LOCATION=".worktrees"         # or worktrees / user override
WT_PATH="$LOCATION/$FEATURE"

git fetch origin "$BASE" --prune 2>/dev/null || git fetch origin --prune

# Ensure parent is ignored (project-local only)
if [ ! -d "$LOCATION" ]; then
  mkdir -p "$LOCATION"
fi
if ! git check-ignore -q "$LOCATION" 2>/dev/null; then
  # Prefer existing ignore patterns (.worktrees/ often already present)
  grep -qxF "$LOCATION/" .gitignore 2>/dev/null || echo "$LOCATION/" >> .gitignore
fi
```

## Create and enter

```bash
# New branch from remote base tip
if git show-ref --verify --quiet "refs/remotes/origin/$BASE"; then
  START="origin/$BASE"
else
  START="$BASE"
fi

if git show-ref --verify --quiet "refs/heads/$FEATURE"; then
  git worktree add "$WT_PATH" "$FEATURE"
else
  git worktree add -b "$FEATURE" "$WT_PATH" "$START"
fi

cd "$WT_PATH"
# optional: bun install / npm install if node_modules is not shared
```

## After the feature (not this skill’s job)

Use **`post-pr-merge`** (or manual `git worktree remove`) once the PR is merged — do not delete worktrees mid-intensive loop.

## Report (include in Phase 0 / handoff)

- Worktree path
- Feature branch
- Base branch used as start point
- Skipped? (yes — already isolated)
