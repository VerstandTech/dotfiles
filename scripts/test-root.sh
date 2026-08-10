#!/usr/bin/env bash
# Root assurance adapter: Python contracts, repo-only AI resources, Pi + personal tests.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 -m unittest tests.test_rules_contract

python3 "$ROOT/agents-shared/.agents/scripts/verify-ai-resources.py" --repo "$ROOT"

cd "$ROOT/pi"
bun test

cd "$ROOT/agents-shared/.agents/adapters/pi/personal"
bun test lib
