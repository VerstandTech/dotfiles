#!/usr/bin/env bash
# Resolve only thread IDs whose reply calls were independently verified successful.
# Usage: resolve-threads.sh <PRRT_id>... | echo ids | resolve-threads.sh -
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <verified-replied-PRRT-id>... (or '-' for stdin)" >&2
  exit 64
fi

resolve_one() {
  local id="$1" response
  if ! response=$(gh api graphql \
    -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}' \
    -f id="$id"); then
    echo "resolveReviewThread transport/API failure for $id" >&2
    return 69
  fi
  if ! jq -e --arg id "$id" \
    '((.errors // []) | length) == 0 and .data.resolveReviewThread.thread.id == $id and .data.resolveReviewThread.thread.isResolved == true' \
    >/dev/null <<<"$response"; then
    echo "resolveReviewThread unverified/unknown for $id" >&2
    return 69
  fi
  jq -c '.data.resolveReviewThread.thread' <<<"$response"
}

if [[ "$1" == "-" ]]; then
  while IFS= read -r id; do
    [[ -z "$id" ]] || resolve_one "$id"
  done
else
  for id in "$@"; do resolve_one "$id"; done
fi
