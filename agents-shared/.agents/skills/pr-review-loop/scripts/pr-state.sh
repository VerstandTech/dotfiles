#!/usr/bin/env bash
# Fetch a fail-closed, head-SHA-fenced PR review snapshot.
# Usage: pr-state.sh <pr-number> [owner] [repo]
set -euo pipefail

PR="${1:?Usage: pr-state.sh <pr-number> [owner] [repo]}"
OWNER="${2:-}"
REPO="${3:-}"
GH_CALL_TIMEOUT_SECONDS="${GH_CALL_TIMEOUT_SECONDS:-30}"
[[ "$GH_CALL_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || { echo "invalid GH_CALL_TIMEOUT_SECONDS" >&2; exit 64; }

# Bound each gh subprocess independently on macOS/Linux. A timed-out gh process
# and its descendants are terminated as one dedicated process group.
run_gh_bounded() {
  local stdout_file="$1" stderr_file="$2"; shift 2
  python3 - "$GH_CALL_TIMEOUT_SECONDS" "$stdout_file" "$stderr_file" "$@" <<'PY'
import os, signal, subprocess, sys
seconds = int(sys.argv[1])
stdout_path, stderr_path = sys.argv[2], sys.argv[3]
args = sys.argv[4:]
with open(stdout_path, "wb") as stdout, open(stderr_path, "wb") as stderr:
    try:
        process = subprocess.Popen(["gh", *args], stdout=stdout, stderr=stderr, start_new_session=True)
    except OSError as error:
        stderr.write(f"unable to launch gh: {error}\n".encode())
        sys.exit(127)
    try:
        sys.exit(process.wait(timeout=seconds))
    except subprocess.TimeoutExpired:
        stderr.write(f"gh call timed out after {seconds}s\n".encode())
        stderr.flush()
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=1)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
        sys.exit(124)
PY
}

retry_gh() {
  local attempt=1 delay=1 max_attempts=3 rc out err
  out=$(mktemp); err=$(mktemp)
  while true; do
    set +e
    run_gh_bounded "$out" "$err" "$@"
    rc=$?
    set -e
    if (( rc == 0 )); then
      cat "$out"
      rm -f "$out" "$err"
      return 0
    fi
    if (( attempt >= max_attempts )); then
      cat "$err" >&2
      echo "gh failed after $max_attempts attempts: gh $*" >&2
      rm -f "$out" "$err"
      (( rc == 124 )) && return 75
      return 69
    fi
    sleep "$delay"
    attempt=$((attempt + 1)); delay=$((delay * 2))
  done
}

# `gh pr checks` has semantic nonzero exits: 1 when valid rows contain failed/
# cancelled checks, and 8 when valid rows contain pending checks. Timeout, launch,
# transport, or mismatched status/payload combinations are never accepted.
capture_gh_json_array() {
  local attempt=1 delay=1 max_attempts=3 rc
  local stdout_file stderr_file
  stdout_file=$(mktemp); stderr_file=$(mktemp)
  while true; do
    set +e
    run_gh_bounded "$stdout_file" "$stderr_file" "$@"
    rc=$?
    set -e
    if jq -e 'type == "array"' >/dev/null 2>&1 <"$stdout_file"; then
      if (( rc == 0 )) ||
         { (( rc == 1 )) && jq -e 'length > 0 and any(.[]; .bucket=="fail" or .bucket=="cancel")' >/dev/null <"$stdout_file"; } ||
         { (( rc == 8 )) && jq -e 'length > 0 and any(.[]; .bucket=="pending")' >/dev/null <"$stdout_file"; }; then
        cat "$stdout_file"
        rm -f "$stdout_file" "$stderr_file"
        return 0
      fi
    fi
    if (( attempt >= max_attempts )); then
      cat "$stderr_file" >&2
      echo "gh returned no valid JSON array after $max_attempts attempts (last exit $rc): gh $*" >&2
      rm -f "$stdout_file" "$stderr_file"
      return 75
    fi
    sleep "$delay"
    attempt=$((attempt + 1)); delay=$((delay * 2))
  done
}

if [[ -z "$OWNER" || -z "$REPO" ]]; then
  read -r OWNER REPO < <(retry_gh repo view --json owner,name -q '.owner.login + " " + .name')
fi

fetch_meta() {
  retry_gh pr view "$PR" --repo "$OWNER/$REPO" \
    --json number,title,state,isDraft,author,body,baseRefName,headRefName,headRefOid,url,mergeable,mergeStateStatus,mergedAt,mergeCommit,statusCheckRollup
}

# Fence starts before any review/comment/check discovery.
META_BEFORE=$(fetch_meta)
HEAD_BEFORE=$(jq -er '.headRefOid | select(type == "string" and length > 0)' <<<"$META_BEFORE")

THREAD_QUERY='
  query($owner:String!,$name:String!,$pr:Int!,$after:String){
    repository(owner:$owner, name:$name){
      pullRequest(number:$pr){
        reviewThreads(first:100, after:$after){
          nodes{
            id isResolved isOutdated path line
            comments(first:1){ nodes{ databaseId author{login} body createdAt } }
          }
          pageInfo{ hasNextPage endCursor }
        }
      }
    }
  }
'
THREADS='[]'
CURSOR=''
while true; do
  THREAD_ARGS=(api graphql -f query="$THREAD_QUERY" -f owner="$OWNER" -f name="$REPO" -F pr="$PR")
  [[ -n "$CURSOR" ]] && THREAD_ARGS+=(-f after="$CURSOR")
  PAGE=$(retry_gh "${THREAD_ARGS[@]}")
  if ! jq -e '((.errors // []) | length) == 0 and (.data.repository.pullRequest.reviewThreads.nodes | type == "array")' >/dev/null <<<"$PAGE"; then
    echo "GraphQL reviewThreads response contains errors or is incomplete" >&2
    exit 69
  fi
  PAGE_THREADS=$(jq '[.data.repository.pullRequest.reviewThreads.nodes[]
    | select(.isResolved == false)
    | {id,path,line,isOutdated,firstComment:.comments.nodes[0]}]' <<<"$PAGE")
  THREADS=$(jq -cn --argjson accumulated "$THREADS" --argjson page "$PAGE_THREADS" '$accumulated + $page')
  HAS_NEXT=$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage' <<<"$PAGE")
  [[ "$HAS_NEXT" == "true" ]] || break
  CURSOR=$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor // empty' <<<"$PAGE")
  [[ -n "$CURSOR" ]] || { echo "reviewThreads hasNextPage without endCursor" >&2; exit 69; }
done

# Installed gh rejects --paginate + --slurp + --jq together. Capture raw slurped
# pages first, then validate and project with external jq into one JSON array.
ISSUE_COMMENT_PAGES=$(retry_gh api "repos/$OWNER/$REPO/issues/$PR/comments" --paginate --slurp)
if ! ISSUE_COMMENTS=$(jq -ce '
  if type == "array" and all(.[]; type == "array")
  then [.[][] | {id,user:.user.login,body,created_at}]
  else error("invalid paginated issue-comment shape") end
' <<<"$ISSUE_COMMENT_PAGES"); then
  echo "issue-comment pagination returned invalid JSON pages" >&2
  exit 69
fi
REVIEWS=$(retry_gh pr view "$PR" --repo "$OWNER/$REPO" --json reviews --jq '.reviews')
REQUIRED_CHECKS=$(capture_gh_json_array pr checks "$PR" --repo "$OWNER/$REPO" \
  --required --json name,state,bucket,workflow,link)

# Fence closes after required-check discovery. Only equal heads bind the snapshot.
META_AFTER=$(fetch_meta)
HEAD_AFTER=$(jq -er '.headRefOid | select(type == "string" and length > 0)' <<<"$META_AFTER")
if [[ "$HEAD_BEFORE" != "$HEAD_AFTER" ]]; then
  echo "PR head drifted during discovery: before=$HEAD_BEFORE after=$HEAD_AFTER" >&2
  exit 75
fi
CHECK_HEAD_SHA="$HEAD_AFTER"
CHECKS=$(jq '.statusCheckRollup // []' <<<"$META_AFTER")
META=$(jq 'del(.statusCheckRollup)' <<<"$META_AFTER")

jq -n \
  --argjson meta "$META" \
  --argjson threads "$THREADS" \
  --argjson issue_comments "$ISSUE_COMMENTS" \
  --argjson reviews "$REVIEWS" \
  --argjson checks "$CHECKS" \
  --argjson required_checks "$REQUIRED_CHECKS" \
  --arg check_head_sha "$CHECK_HEAD_SHA" \
  '{meta:$meta, snapshot:{verified:true,check_head_sha:$check_head_sha}, threads:$threads, issue_comments:$issue_comments, reviews:$reviews, checks:$checks, required_checks:$required_checks}'
