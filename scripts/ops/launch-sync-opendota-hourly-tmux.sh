#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
session="d2hub-sync-opendota-hourly"
base_url="https://dota2-hub.vercel.app"
interval_min="60"
timeout_ms="420000"
min_interval_min="60"
quiet="1"
env_file=".env.local"
log_file=""

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --base-url=*) base_url="${arg#*=}" ;;
    --interval-min=*) interval_min="${arg#*=}" ;;
    --timeout-ms=*) timeout_ms="${arg#*=}" ;;
    --min-interval-min=*) min_interval_min="${arg#*=}" ;;
    --quiet=*) quiet="${arg#*=}" ;;
    --env-file=*) env_file="${arg#*=}" ;;
    --log-file=*) log_file="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2; exit 1; }
[[ "$interval_min" =~ ^[0-9]+$ ]] || { echo "interval-min must be numeric" >&2; exit 1; }
[[ "$timeout_ms" =~ ^[0-9]+$ ]] || { echo "timeout-ms must be numeric" >&2; exit 1; }
[[ "$min_interval_min" =~ ^[0-9]+$ ]] || { echo "min-interval-min must be numeric" >&2; exit 1; }
[[ "$quiet" == "0" || "$quiet" == "1" ]] || { echo "quiet must be 0 or 1" >&2; exit 1; }

base_url="${base_url%/}"
endpoint="sync-opendota|${base_url}/api/cron?action=sync-opendota"

resolved_env_file=""
if [[ -n "$env_file" ]]; then
  resolved_env_file="$env_file"
  if [[ "$resolved_env_file" != /* ]]; then
    resolved_env_file="$ROOT_DIR/$resolved_env_file"
  fi
  [[ -f "$resolved_env_file" ]] || { echo "env file not found: $resolved_env_file" >&2; exit 1; }
fi

if [[ -z "$log_file" ]]; then
  log_file="/tmp/${session}.jsonl"
fi

if [[ "$log_file" != /* ]]; then
  log_file="$ROOT_DIR/$log_file"
fi

mkdir -p "$(dirname "$log_file")"

node_cmd="node"
if [[ -n "$resolved_env_file" ]]; then
  node_cmd="node --env-file=$(printf '%q' "$resolved_env_file")"
fi

runner_cmd="cd $(printf '%q' "$ROOT_DIR") && ${node_cmd} scripts/ops/hourly-cron-refresh.mjs --endpoints=$(printf '%q' "$endpoint") --interval-min=$(printf '%q' "$interval_min") --min-interval-min=$(printf '%q' "$min_interval_min") --timeout-ms=$(printf '%q' "$timeout_ms") --log=$(printf '%q' "$log_file")"
if [[ "$quiet" == "1" ]]; then
  runner_cmd+=" --quiet"
fi

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "endpoint=$endpoint"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
