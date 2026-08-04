#!/usr/bin/env bash
# Hold the cleanup lock while one complete cleanup plan runs in its own session.
# Usage: cleanup-lock-driver.sh --git-common-dir <absolute-dir> -- <command> [args...]
set -euo pipefail

if [[ "${1:-}" != "--git-common-dir" || -z "${2:-}" || "${3:-}" != "--" || "$#" -lt 4 ]]; then
  echo "usage: $0 --git-common-dir <absolute-dir> -- <command> [args...]" >&2
  exit 64
fi
GIT_COMMON="$2"; shift 3
[[ "$GIT_COMMON" = /* && -d "$GIT_COMMON" ]] || { echo "invalid git common dir: $GIT_COMMON" >&2; exit 64; }

CLEANUP_LOCK="$GIT_COMMON/post-pr-merge.lock"
OWNER_FILE="$CLEANUP_LOCK/owner"
READY_FILE="$CLEANUP_LOCK/group-ready"
TOKEN="$$-${RANDOM:-0}-$(date +%s)"
LAUNCHER_PID=""
LAUNCHER_STATUS=""
GROUP_LEADER=""
CANCEL_SIGNAL=""
RETAIN_LOCK=0

release_lock() {
  (( RETAIN_LOCK == 0 )) || return 75
  if [[ -f "$OWNER_FILE" ]] && grep -Fqx "token=$TOKEN" "$OWNER_FILE"; then
    rm -f "$READY_FILE" "$OWNER_FILE"
    rmdir "$CLEANUP_LOCK" || return 75
  fi
}

launcher_alive() {
  [[ -n "$LAUNCHER_PID" ]] && kill -0 "$LAUNCHER_PID" 2>/dev/null
}

group_alive() {
  [[ -n "$GROUP_LEADER" ]] && kill -0 -- "-$GROUP_LEADER" 2>/dev/null
}

load_group_ready() {
  local ready_group
  [[ -n "$LAUNCHER_PID" && -s "$READY_FILE" ]] || return 1
  IFS= read -r ready_group <"$READY_FILE" || return 1
  [[ "$ready_group" =~ ^[0-9]+$ && "$ready_group" == "$LAUNCHER_PID" ]] || return 1
  GROUP_LEADER="$ready_group"
}

# Return 0 when the dedicated group is known, 2 when the launcher exited before
# readiness, and 1 when neither readiness nor launcher exit can be proven.
wait_launcher_ready_or_exit() {
  local i rc
  for ((i=0; i<100; i++)); do
    if load_group_ready; then
      return 0
    fi
    if ! launcher_alive; then
      set +e
      wait "$LAUNCHER_PID"
      rc=$?
      set -e
      LAUNCHER_STATUS="$rc"
      return 2
    fi
    sleep 0.1
  done
  return 1
}

wait_group_quiescent() {
  local i
  for ((i=0; i<50; i++)); do
    group_alive || return 0
    sleep 0.1
  done
  return 1
}

retain_unknown() {
  local reason="$1"
  RETAIN_LOCK=1
  printf '%s launcher=%s group=%s\n' "$reason" "${LAUNCHER_PID:-unknown}" "${GROUP_LEADER:-unknown}" >>"$OWNER_FILE"
  echo "cleanup ownership/quiescence unknown; retaining lock $CLEANUP_LOCK" >&2
  exit 75
}

terminate_group() {
  local signal="$1" code="$2" readiness
  trap - INT TERM

  if [[ -z "$GROUP_LEADER" ]]; then
    set +e
    wait_launcher_ready_or_exit
    readiness=$?
    set -e
    case "$readiness" in
      0) ;;
      2)
        # The helper writes readiness after setsid and before exec. Exiting before
        # readiness proves that no cleanup command or descendant was launched.
        release_lock || { echo "cleanup lock release unknown" >&2; exit 75; }
        exit "$code"
        ;;
      *) retain_unknown "launcher-readiness-unproven signal=$signal" ;;
    esac
  fi

  if group_alive; then
    kill -"$signal" -- "-$GROUP_LEADER" 2>/dev/null || true
  fi
  if ! wait_group_quiescent; then
    retain_unknown "termination-unproven signal=$signal"
  fi
  release_lock || { echo "cleanup lock release unknown" >&2; exit 75; }
  exit "$code"
}

mark_startup_cancel() {
  CANCEL_SIGNAL="$1"
}

if ! mkdir "$CLEANUP_LOCK" 2>/dev/null; then
  echo "cleanup lock already held: $CLEANUP_LOCK" >&2
  cat "$OWNER_FILE" >&2 2>/dev/null || true
  exit 75
fi
printf 'token=%s\npid=%s\npane=%s\ncwd=%s\nstarted=%s\n' "$TOKEN" "$$" "${HERDR_PANE_ID:-none}" "$PWD" "$(date -u +%FT%TZ)" >"$OWNER_FILE"
trap 'release_lock || true' EXIT
# During launch, record cancellation without releasing. The main path waits for
# the helper's ready handshake or proven exit before acting on the signal.
trap 'mark_startup_cancel INT' INT
trap 'mark_startup_cancel TERM' TERM

# Python is cross-platform on supported dotfiles hosts. It creates a dedicated
# session, atomically publishes its process-group ID, then execs the cleanup plan.
python3 - "$READY_FILE" "$@" <<'PY' &
import os, sys
ready = sys.argv[1]
command = sys.argv[2:]
os.setsid()
temporary = f"{ready}.{os.getpid()}.tmp"
with open(temporary, "w", encoding="utf-8") as handle:
    handle.write(f"{os.getpgrp()}\n")
    handle.flush()
    os.fsync(handle.fileno())
os.replace(temporary, ready)
os.execvp(command[0], command)
PY
LAUNCHER_PID=$!
printf 'launcher=%s\n' "$LAUNCHER_PID" >>"$OWNER_FILE"

set +e
wait_launcher_ready_or_exit
READINESS=$?
set -e
case "$READINESS" in
  0) printf 'group=%s\nready=1\n' "$GROUP_LEADER" >>"$OWNER_FILE" ;;
  2) exit "$LAUNCHER_STATUS" ;;
  *) retain_unknown "launcher-readiness-unproven" ;;
esac

trap 'terminate_group INT 130' INT
trap 'terminate_group TERM 143' TERM
if [[ -n "$CANCEL_SIGNAL" ]]; then
  terminate_group "$CANCEL_SIGNAL" "$([[ "$CANCEL_SIGNAL" == INT ]] && echo 130 || echo 143)"
fi

set +e
wait "$LAUNCHER_PID"
STATUS=$?
set -e
if ! wait_group_quiescent; then
  retain_unknown "normal-exit-descendants-active"
fi
GROUP_LEADER=""
exit "$STATUS"
