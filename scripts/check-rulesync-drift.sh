#!/usr/bin/env bash
# Fail if generated AGENTS.md drifts from rulesync.jsonc + .rulesync/**.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/node_modules/.bin/rulesync"
EXPECTED_VERSION="16.9.1"

if [[ ! -e "${BIN}" ]]; then
  echo "error: local Rulesync binary missing at node_modules/.bin/rulesync" >&2
  echo "error: install the pinned dependency with: bun install --frozen-lockfile" >&2
  exit 127
fi

version_raw="$("${BIN}" --version 2>/dev/null || true)"
version="$(printf '%s\n' "${version_raw}" | head -n1 | tr -d '[:space:]')"
version="${version#v}"
if [[ "${version}" == */* ]]; then
  version="${version##*/}"
fi

if [[ "${version}" != "${EXPECTED_VERSION}" ]]; then
  echo "error: Rulesync version mismatch: got '${version_raw:-<empty>}', expected ${EXPECTED_VERSION}" >&2
  echo "error: refuse to check; fix package.json/bun.lock and reinstall with bun install --frozen-lockfile" >&2
  exit 1
fi

cd "${ROOT}"
exec "${BIN}" generate --check
