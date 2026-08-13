#!/usr/bin/env bash
# Portable Graphiti + FalkorDB + pi-graphiti bring-up.
# Safe to rerun on another machine. Does not print secret values.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT/docs/graphiti"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose-falkordb.yml"
CONFIG_FILE="$COMPOSE_DIR/config-docker-falkordb.yaml"
PI_CONFIG="${PI_GRAPHITI_CONFIG:-$HOME/.pi/agent/pi-graphiti-config.json}"
PROJECT="graphiti"
MCP_URL="${PI_GRAPHITI_URL:-http://localhost:8000/mcp/}"
OLLAMA_LLM="${GRAPHITI_OLLAMA_LLM:-llama3.2}"
OLLAMA_EMBED="${GRAPHITI_OLLAMA_EMBED:-nomic-embed-text}"
STATUS_ONLY=0
NO_WAIT=0

usage() {
	cat <<'EOF'
Usage: bash scripts/setup-graphiti.sh [--status] [--no-wait]

Starts FalkorDB + Graphiti MCP with host ports:
  6379  FalkorDB
  3001  FalkorDB Browser (not 3000)
  8000  Graphiti MCP

LLM/embedder:
  If OPENAI_API_KEY is set and is not the local placeholder, use that
  OpenAI-compatible endpoint (OPENAI_API_URL defaults to api.openai.com).
  Otherwise install/start Ollama and use:
    OPENAI_API_URL=http://host.docker.internal:11434/v1
    MODEL_NAME=llama3.2
    EMBEDDER_MODEL=nomic-embed-text

Writes ~/.pi/agent/pi-graphiti-config.json (no secrets).
Does not claim /graph uninstall ownership of a pre-existing stack.
EOF
}

log() { printf '%s\n' "$*"; }
die() { printf 'setup-graphiti: %s\n' "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

port_in_use() {
	local port="$1"
	if have lsof; then
		lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
		return $?
	fi
	return 1
}

http_code() {
	local url="$1"
	curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "$url" 2>/dev/null || printf '000'
}

write_pi_config() {
	local backend_dir="$1"
	mkdir -p "$(dirname "$PI_CONFIG")"
	if [[ -f "$PI_CONFIG" ]]; then
		python3 - "$PI_CONFIG" "$MCP_URL" "$backend_dir" <<'PY'
import json, sys
path, url, backend = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    data = json.loads(open(path, encoding="utf-8").read())
    if not isinstance(data, dict):
        data = {}
except (OSError, UnicodeError, json.JSONDecodeError):
    data = {}
data.setdefault("enabled", True)
data["url"] = url
data.setdefault("groupId", "")
data["projectScoping"] = True
data.setdefault("injectContext", False)
data.setdefault("nudgeInterval", 10)
data.setdefault("flushOnCompact", True)
data.setdefault("flushOnShutdown", True)
data.setdefault("flushMinTurns", 6)
data["backendDir"] = backend
data.setdefault("startedBySetup", False)
path_tmp = path + ".tmp"
with open(path_tmp, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
import os
os.replace(path_tmp, path)
print(path)
PY
	else
		python3 - "$PI_CONFIG" "$MCP_URL" "$backend_dir" <<'PY'
import json, os, sys
path, url, backend = sys.argv[1], sys.argv[2], sys.argv[3]
data = {
    "enabled": True,
    "url": url,
    "groupId": "",
    "projectScoping": True,
    "injectContext": False,
    "nudgeInterval": 10,
    "flushOnCompact": True,
    "flushOnShutdown": True,
    "flushMinTurns": 6,
    "backendDir": backend,
    "startedBySetup": False,
}
os.makedirs(os.path.dirname(path), exist_ok=True)
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
os.replace(tmp, path)
print(path)
PY
	fi
}

status_report() {
	log "compose: $COMPOSE_FILE"
	if have docker; then
		docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps || true
	else
		log "docker: missing"
	fi
	log "mcp url: $MCP_URL"
	log "mcp http: $(http_code "$MCP_URL")"
	log "falkor browser http: $(http_code "http://localhost:3001/")"
	if have ollama; then
		log "ollama: present"
	else
		log "ollama: missing"
	fi
	if [[ -f "$PI_CONFIG" ]]; then
		log "pi-graphiti-config: present"
	else
		log "pi-graphiti-config: missing"
	fi
}

ensure_docker() {
	have docker || die "docker is required"
	docker info >/dev/null 2>&1 || die "docker daemon is not running"
	docker compose version >/dev/null 2>&1 || die "docker compose is required"
}

ensure_ports() {
	if port_in_use 3000; then
		log "note: host :3000 is already in use; using remapped FalkorDB UI :3001"
	fi
	if port_in_use 8000; then
		if [[ "$(http_code "$MCP_URL")" != "000" ]]; then
			log "note: :8000 already answers; leaving existing MCP in place"
			return 0
		fi
		die "host :8000 is in use but is not the Graphiti MCP URL"
	fi
	if port_in_use 6379; then
		log "note: host :6379 already in use; compose will fail if it is not FalkorDB"
	fi
}

ensure_llm() {
	local key="${OPENAI_API_KEY:-}"
	if [[ -n "$key" && "$key" != "ollama" ]]; then
		export OPENAI_API_URL="${OPENAI_API_URL:-https://api.openai.com/v1}"
		export MODEL_NAME="${MODEL_NAME:-gpt-4o-mini}"
		export EMBEDDER_MODEL="${EMBEDDER_MODEL:-text-embedding-3-small}"
		export EMBEDDER_DIMENSIONS="${EMBEDDER_DIMENSIONS:-1536}"
		log "llm: using provided OpenAI-compatible endpoint"
		return 0
	fi

	log "llm: no cloud OPENAI_API_KEY; using local Ollama"
	if ! have ollama; then
		if have brew; then
			log "installing ollama via Homebrew"
			brew install ollama
		else
			die "ollama is required when OPENAI_API_KEY is unset (or install Homebrew)"
		fi
	fi
	if ! port_in_use 11434; then
		if have brew && [[ "$(uname -s)" == "Darwin" ]]; then
			brew services start ollama >/dev/null 2>&1 || true
		fi
		if ! port_in_use 11434; then
			nohup ollama serve >/tmp/ollama-graphiti.log 2>&1 &
			sleep 2
		fi
	fi
	port_in_use 11434 || die "ollama is installed but :11434 is not listening"
	ollama pull "$OLLAMA_LLM"
	ollama pull "$OLLAMA_EMBED"
	export OPENAI_API_KEY="ollama"
	export OPENAI_API_URL="${OPENAI_API_URL:-http://host.docker.internal:11434/v1}"
	export MODEL_NAME="${MODEL_NAME:-$OLLAMA_LLM}"
	export EMBEDDER_MODEL="${EMBEDDER_MODEL:-$OLLAMA_EMBED}"
	export EMBEDDER_DIMENSIONS="${EMBEDDER_DIMENSIONS:-768}"
	log "llm: ollama $MODEL_NAME / $EMBEDDER_MODEL"
}

wait_for_mcp() {
	local i
	for i in $(seq 1 60); do
		if [[ "$(http_code "$MCP_URL")" != "000" ]]; then
			log "mcp reachable after ${i}s"
			return 0
		fi
		sleep 2
	done
	docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color --tail 80 graphiti-mcp >&2 || true
	die "Graphiti MCP did not become reachable at $MCP_URL"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--status) STATUS_ONLY=1 ;;
		--no-wait) NO_WAIT=1 ;;
		-h|--help) usage; exit 0 ;;
		*) die "unknown argument: $1" ;;
	esac
	shift
done

[[ -f "$COMPOSE_FILE" ]] || die "missing $COMPOSE_FILE"
[[ -f "$CONFIG_FILE" ]] || die "missing $CONFIG_FILE"

if [[ "$STATUS_ONLY" -eq 1 ]]; then
	status_report
	exit 0
fi

ensure_docker
ensure_ports
ensure_llm

log "starting compose project $PROJECT"
docker compose -p "$PROJECT" --project-directory "$COMPOSE_DIR" -f "$COMPOSE_FILE" up -d

if [[ "$NO_WAIT" -eq 0 ]]; then
	wait_for_mcp
fi

written="$(write_pi_config "$COMPOSE_DIR")"
log "wrote $written"
status_report
log "reload Pi, then run /graph"
