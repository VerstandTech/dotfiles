---
name: sentry-triage
description: Triage and fix Sentry production/staging errors in a structured workflow. Use when the user says "fix sentry errors", "sentry triage", "check production errors", "check sentry", "fix production bugs", or wants to review and resolve recent Sentry issues. Fetches unresolved errors from the last 24 hours, creates GitHub issues for untracked errors, plans fixes, implements them, and runs post-implementation review.
---

# Sentry Triage

Structured workflow for triaging and fixing Sentry errors across production and staging environments.

## Workflow

### Step 1: Fetch Unresolved Errors

Use `mcp__Sentry__search_issues` to fetch unresolved issues from the last 24 hours.

Run two searches (production and staging):

```
mcp__Sentry__search_issues(
  naturalLanguageQuery="unresolved issues from the last 24 hours",
  limit=25
)
```

Present a summary table to the user:

| # | Issue ID | Title | Environment | Events | Users | First Seen |
|---|----------|-------|-------------|--------|-------|------------|

Ask the user which issues to work on (all, or a subset).

### Step 2: Analyze Each Issue

For each selected issue, use `mcp__Sentry__get_issue_details` to get the full stacktrace and context.

Extract:
- Error type and message
- Full stacktrace with file paths and line numbers
- Affected environment (production/staging)
- Frequency and user impact
- Tags and breadcrumbs

### Step 3: Cross-Reference GitHub Issues

For each Sentry issue, search GitHub for an existing linked issue:

```
mcp__github__search_issues(
  query="<sentry issue title or ID> in:title,body",
  owner="VerstandTech",
  repo="olhaminha.bio"
)
```

- If a GitHub issue exists: note its number and link it
- If no GitHub issue exists: create one using `mcp__github__issue_write`:

```
mcp__github__issue_write(
  method="create",
  owner="VerstandTech",
  repo="olhaminha.bio",
  title="fix: <concise error description>",
  body="## Sentry Issue\n\n**Issue ID**: <ID>\n**Environment**: <env>\n**Events**: <count>\n**Users affected**: <count>\n\n## Error\n\n```\n<error message + key stacktrace frames>\n```\n\n## Context\n\n<breadcrumbs, tags, or additional context from Sentry>",
  labels=["bug", "sentry"]
)
```

### Step 4: Create Branch

Create a single branch for all fixes:

```bash
git checkout develop
git pull origin develop
git checkout -b fix/sentry-triage-YYYY-MM-DD
```

Use today's date in the branch name.

### Step 5: Plan Fixes

Use the `superpowers:writing-plans` skill to create an implementation plan covering all selected issues.

The plan should:
- Group related errors that share a root cause
- Order fixes by severity (most impactful first)
- Reference the specific files and line numbers from stacktraces
- Include the GitHub issue numbers (e.g., "Fixes #123")

### Step 6: Implement Fixes

Execute the plan using the project's standard patterns (CLAUDE.md rules apply). For each fix:
- Read the affected code using stacktrace file paths
- Apply the fix following project architecture (DDD layers, etc.)
- Reference the GitHub issue in commit context

### Step 7: Post-Implementation

After all fixes are implemented, invoke the `/post-implementation` skill for code review and final validation.

### Step 8: Commit, Push & Open PR

After post-implementation review passes:

1. **Commit** all changes with a descriptive message referencing the GitHub issues:
   ```
   fix: resolve sentry errors from YYYY-MM-DD

   Fixes #111, #222, #333
   ```

2. **Push** the branch:
   ```bash
   git push -u origin fix/sentry-triage-YYYY-MM-DD
   ```

3. **Open a PR** targeting `develop`. Try the GitHub MCP tool first, fall back to `gh` CLI if MCP fails:

   **Primary (MCP):**
   ```
   mcp__github__create_pull_request(
     owner="VerstandTech",
     repo="olhaminha.bio",
     title="fix: resolve sentry errors from YYYY-MM-DD",
     body="## Summary\n\n- Fixed N sentry issues from production/staging\n- Created GitHub issues for untracked errors\n\n## Issues Resolved\n\n- Fixes #111 — <description>\n- Fixes #222 — <description>\n\n## Test plan\n\n- [ ] Verify fixes locally\n- [ ] Monitor Sentry after deploy for regression",
     base="develop",
     head="fix/sentry-triage-YYYY-MM-DD"
   )
   ```

   **Fallback (gh CLI):**
   ```bash
   gh pr create --base develop --title "fix: resolve sentry errors from YYYY-MM-DD" --body "$(cat <<'EOF'
   ## Summary

   - Fixed N sentry issues from production/staging
   - Created GitHub issues for untracked errors

   ## Issues Resolved

   - Fixes #111 — <description>
   - Fixes #222 — <description>

   ## Test plan

   - [ ] Verify fixes locally
   - [ ] Monitor Sentry after deploy for regression
   EOF
   )"
   ```

Return the PR URL to the user when done.

## MCP Fallback Rule

Throughout this workflow, if any GitHub MCP tool call fails (timeout, auth error, etc.), fall back to the equivalent `gh` CLI command:
- `mcp__github__search_issues` → `gh issue list --search "..." --repo VerstandTech/olhaminha.bio`
- `mcp__github__issue_write` → `gh issue create --repo VerstandTech/olhaminha.bio --title "..." --body "..." --label bug --label sentry`
- `mcp__github__create_pull_request` → `gh pr create --base develop ...`
