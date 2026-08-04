# gh + GraphQL Cheatsheet

Exact commands for every step of the PR review loop. These are battle-tested — copy them, don't paraphrase.

## Setup

The `gh` CLI must be authenticated (`gh auth status`). All `gh api graphql` calls use the same token.

`OWNER` and `REPO` below come from `gh repo view --json owner,name -q '.owner.login + "/" + .name'` or are visible in the PR URL.

For read-only discovery, retry transient failures three times with short bounded backoff. Every call also gets a finite cross-platform subprocess deadline. Do not retry mutations blindly:

```bash
GH_CALL_TIMEOUT_SECONDS=${GH_CALL_TIMEOUT_SECONDS:-30}
gh_bounded() {
  python3 - "$GH_CALL_TIMEOUT_SECONDS" "$@" <<'PY'
import os, signal, subprocess, sys
seconds, args = int(sys.argv[1]), sys.argv[2:]
process = subprocess.Popen(["gh", *args], start_new_session=True)
try:
    raise SystemExit(process.wait(timeout=seconds))
except subprocess.TimeoutExpired:
    print(f"gh call timed out after {seconds}s", file=sys.stderr)
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=1)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        process.wait()
    raise SystemExit(124)
PY
}
retry_gh() {
  local attempt=1 delay=1 rc
  while true; do
    set +e; gh_bounded "$@"; rc=$?; set -e
    (( rc == 0 )) && return 0
    if (( attempt >= 3 )); then
      (( rc == 124 )) && return 75
      return 69
    fi
    sleep "$delay"
    attempt=$((attempt + 1)); delay=$((delay * 2))
  done
}
```

If all retries fail, that discovery surface is **unknown**. Never substitute `[]`, `null`, or "no checks/threads" for a transport error.

## Phase 1: Fetch PR state

### PR metadata + body
```bash
retry_gh pr view <PR> --json number,title,state,isDraft,author,body,baseRefName,headRefName,headRefOid,url,mergeable,mergeStateStatus,mergedAt,mergeCommit,statusCheckRollup
```

If `gh pr view` fails after retries, fall back to REST for state/head/merge facts:

```bash
retry_gh api repos/<OWNER>/<REPO>/pulls/<PR> \
  --jq '{number,state,merged,merged_at,merge_commit_sha,head:{ref:.head.ref,sha:.head.sha},base:{ref:.base.ref},html_url}'
```

REST cannot replace GraphQL review-thread IDs. Use each endpoint independently so a `gh pr view` failure does not erase thread evidence.

### Inline review comments (the per-line ones)
```bash
retry_gh api repos/<OWNER>/<REPO>/pulls/<PR>/comments --paginate
```
Each entry has `id` (numeric), `pull_request_review_id`, `user.login`, `body`, `path`, `line`, `in_reply_to_id` (only on replies).

### Issue-level comments (the conversation ones, not tied to lines)
```bash
PAGES=$(retry_gh api repos/<OWNER>/<REPO>/issues/<PR>/comments --paginate --slurp)
COMMENTS=$(jq -ce 'if type=="array" and all(.[];type=="array") then [.[][]|{id,user:.user.login,body,created_at}] else error("bad pages") end' <<<"$PAGES") || exit 69
```

Do not combine installed `gh`'s `--paginate --slurp` with `--jq`; project externally.

### Reviews (approvals, change requests, top-level review bodies)
```bash
retry_gh pr view <PR> --json reviews
```

### Review threads with thread IDs (REQUIRED for resolving)
The REST API does not expose `PRRT_*` IDs. Cursor-paginate GraphQL; a failed page or `hasNextPage` without `endCursor` makes thread state unknown:

```bash
QUERY='query($owner:String!,$name:String!,$pr:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$pr){reviewThreads(first:100,after:$after){nodes{id isResolved isOutdated path line comments(first:1){nodes{databaseId author{login} body}}} pageInfo{hasNextPage endCursor}}}}}'
THREADS='[]'; CURSOR=''
while true; do
  ARGS=(api graphql -f query="$QUERY" -f owner="$OWNER" -f name="$REPO" -F pr="$PR")
  [[ -n "$CURSOR" ]] && ARGS+=(-f after="$CURSOR")
  PAGE=$(retry_gh "${ARGS[@]}") || exit 69
  jq -e '((.errors // [])|length)==0 and (.data.repository.pullRequest.reviewThreads.nodes|type=="array")' >/dev/null <<<"$PAGE" || exit 69
  NODES=$(jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved==false)]' <<<"$PAGE")
  THREADS=$(jq -cn --argjson a "$THREADS" --argjson b "$NODES" '$a+$b')
  [[ "$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage' <<<"$PAGE")" == true ]] || break
  CURSOR=$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor // empty' <<<"$PAGE")
  [[ -n "$CURSOR" ]] || exit 69
done
```

Each node ID is resolvable; the first comment `databaseId` is the reply target. Never treat only the first 100 threads as complete.

### CI checks
```bash
# Preferred: status rollup fetched beside headRefOid
retry_gh pr view <PR> --json headRefOid,statusCheckRollup

# Required gate (current gh supports --required). Use the bounded capture below.
capture_required_checks <PR>

# Full diagnostic view (includes optional checks)
retry_gh pr checks <PR> --json name,state,bucket,link,workflow
```

Use bounded cross-platform polling (or an equivalent tool-level timeout), never an unbounded `--watch`:

```bash
capture_required_checks() {
  local pr="$1" attempt=1 rc output
  while true; do
    set +e
    output=$(gh_bounded pr checks "$pr" --required --json name,state,bucket,link,workflow)
    rc=$?
    set -e
    if jq -e 'type=="array"' >/dev/null 2>&1 <<<"$output" &&
       { (( rc == 0 )) ||
         { (( rc == 1 )) && jq -e 'length>0 and any(.[]; .bucket=="fail" or .bucket=="cancel")' >/dev/null <<<"$output"; } ||
         { (( rc == 8 )) && jq -e 'length>0 and any(.[]; .bucket=="pending")' >/dev/null <<<"$output"; }; }; then
      printf '%s\n' "$output"
      return 0
    fi
    (( attempt >= 3 )) && return 75
    sleep "$attempt"; attempt=$((attempt + 1))
  done
}

DEADLINE=$((SECONDS + 900)); CONCLUDED=0
while (( SECONDS < DEADLINE )); do
  REQUIRED=$(capture_required_checks "$PR") || { echo "required checks unknown" >&2; exit 75; }
  if ! jq -e 'any(.[]; .bucket=="pending")' >/dev/null <<<"$REQUIRED"; then CONCLUDED=1; break; fi
  sleep 15
done
# This call is also per-call bounded through retry_gh and is mandatory even when
# the overall polling deadline expires.
HEAD_AFTER=$(retry_gh pr view "$PR" --json headRefOid,statusCheckRollup) || exit 75
[[ "$(jq -r .headRefOid <<<"$HEAD_AFTER")" == "$CANDIDATE_SHA" ]] || exit 75
(( CONCLUDED == 1 )) || { echo "CI wait timed out: unknown" >&2; exit 75; }
```

The immediate head rediscovery is mandatory on conclusion or timeout. Only `statusCheckRollup`/exact-SHA check-runs for the unchanged candidate bind conclusions. Accept nonzero output only for the documented semantic combinations: exit 1 with nonempty `fail`/`cancel` rows, or exit 8 with nonempty `pending` rows. Reject timeout 124, launch 127, transport failures, empty output, and status/payload mismatches regardless of parseable stdout; retry, then mark unknown.

The full `statusCheckRollup` is not itself the required-check set. Prefer `gh pr checks --required`. If that option/field set is unavailable, inspect classic branch protection and applicable rulesets for the PR base branch; if permissions prevent discovering requirements, the required gate is unknown. As a diagnostic fallback, query check suites/runs for the exact SHA:

```bash
retry_gh api repos/<OWNER>/<REPO>/commits/<FULL_SHA>/check-runs \
  -H 'Accept: application/vnd.github+json'
retry_gh api repos/<OWNER>/<REPO>/commits/<FULL_SHA>/status
```

A partial fallback is not a complete required-check gate unless repository branch-protection/ruleset requirements are also known. `mergeStateStatus` alone does not identify which check is required.

## Phase 6: Reply to a thread

The reply endpoint is per-comment, not per-thread. Reply to the **first comment** in the thread (the one whose `databaseId` you captured); GitHub nests it correctly.

```bash
gh_bounded api -X POST repos/<OWNER>/<REPO>/pulls/<PR>/comments/<COMMENT_ID>/replies \
  -f body='Fixed in <SHA>. <one-sentence what>. <optional why>.'
```

Maintain a list containing **only** thread IDs whose reply API call returned valid success JSON:

```bash
VERIFIED_REPLIED_THREADS=()
# Repeat with THREAD_ID + COMMENT_ID from each discovered thread.
REPLY=$(gh_bounded api -X POST "repos/$OWNER/$REPO/pulls/$PR/comments/$COMMENT_ID/replies" \
  -f body="Fixed in $FIX_SHA. $SUMMARY") || exit 69
jq -e --argjson parent "$COMMENT_ID" '.id != null and .in_reply_to_id == $parent' \
  >/dev/null <<<"$REPLY" || exit 69
VERIFIED_REPLIED_THREADS+=("$THREAD_ID")
```

A timeout, invalid JSON, wrong parent, or nonzero call leaves that thread out of the list and makes reply state unknown. Do not resolve it.

### Reply body conventions

- Lead with the commit SHA: `Fixed in 5b6d7253e.` or `Done in <SHA>.`
- One sentence on **what** changed.
- If you declined an alternative: a sentence on **why** (link a rule/incident/constraint).
- Avoid markdown headings; threads are narrow.

## Phase 6: Resolve a thread

Resolve only `VERIFIED_REPLIED_THREADS`:

```bash
for THREAD_ID in "${VERIFIED_REPLIED_THREADS[@]}"; do
  RESPONSE=$(gh_bounded api graphql \
    -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}' \
    -f id="$THREAD_ID") || exit 69
  jq -e --arg id "$THREAD_ID" \
    '((.errors // [])|length)==0 and .data.resolveReviewThread.thread.id==$id and .data.resolveReviewThread.thread.isResolved==true' \
    >/dev/null <<<"$RESPONSE" || exit 69
done
```

Any GraphQL error, missing/mismatched ID, or `isResolved != true` is nonzero/unknown. Rediscover before claiming resolution.

To **unresolve** (rare):
```bash
gh_bounded api graphql -f query='mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id="<PRRT_ID>"
```

## Phase 7: Inspect a failing CI run

```bash
retry_gh pr checks <PR> --json name,state,bucket,link,workflow
# Bind conclusions with `gh pr view --json headRefOid,statusCheckRollup` or exact-SHA check-runs.
# Pick a failing link; Actions URLs contain the run/job IDs.

retry_gh run view <RUN_ID>                       # summary of the failed run
retry_gh run view <RUN_ID> --log-failed | tail -300   # only the failed-step logs
retry_gh run view <RUN_ID> --log | grep -E "FAIL|Error" | head -50
```

For matrix builds, list the jobs first:
```bash
retry_gh run view <RUN_ID> --json jobs -q '.jobs[] | {name, conclusion, databaseId}'
retry_gh run view --job <JOB_DB_ID> --log-failed
```

To re-run a single failed job after pushing a fix:
```bash
gh_bounded run rerun <RUN_ID> --failed
```

## Quoting tips (heredoc bodies)

Long reply bodies with backticks/quotes are easiest via `--field` with a heredoc:

```bash
gh_bounded api -X POST repos/<O>/<R>/pulls/<PR>/comments/<ID>/replies --field body=@- <<'EOF'
Fixed in 5b6d7253e. Moved the URL-ownership check to pre-flight so a misconfigured
allowlist no longer burns an R2 upload. Skipped the constructor-throw alternative
because of the 6-day worker outage we tracked in oauth-provider-contract.
EOF
```

## Branch and merge races

After a rejected push, missing branch, or unexpected empty result, rediscover before mutating:

```bash
retry_gh pr view <PR> --json state,mergedAt,mergeCommit,headRefName,headRefOid,url
retry_gh api repos/<OWNER>/<REPO>/git/ref/heads/<URL_ENCODED_BRANCH>
```

- `state=MERGED` / non-null `mergedAt`: stop review mutations and report the observed merge commit.
- Open PR + 404 ref: branch is missing; report blocked. Do not silently recreate it.
- Timeout/403/rate limit: ref state is unknown, not deleted.

## Common pitfalls

- **Don't pass `--no-cache` flags to `gh`** — they don't exist; the API is uncached anyway.
- **`gh pr review` is for posting top-level reviews**, not for replying to threads. Use the `pulls/comments/{id}/replies` endpoint instead.
- **`gh pr comment` posts an issue-level comment**, not an inline reply. Different endpoint, different audience.
- **Pagination matters** — `--paginate` for `gh api` REST calls; GraphQL needs explicit cursors. If a one-shot thread query reports `hasNextPage`, continue pagination or mark discovery incomplete/unknown.
- **Exit status is not the CI conclusion** — `gh pr checks` may exit non-zero because checks failed. Parse valid JSON separately from transport errors; prefer `statusCheckRollup` beside `headRefOid`.
- **Never coerce discovery failure to empty JSON** — empty threads/checks only count when a successful endpoint returned them.
- **A bot account can't be `@mentioned`** in replies; the reply notifies the bot's webhook anyway.
