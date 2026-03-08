#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
session="d2hub-live-hero-monitor"
interval_sec="60"
notify="1"
env_file=".env.local"

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --interval-sec=*) interval_sec="${arg#*=}" ;;
    --notify=*) notify="${arg#*=}" ;;
    --env-file=*) env_file="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2; exit 1; }
[[ "$interval_sec" =~ ^[0-9]+$ ]] || { echo "interval-sec must be numeric" >&2; exit 1; }
[[ "$notify" == "0" || "$notify" == "1" ]] || { echo "notify must be 0 or 1" >&2; exit 1; }

resolved_env_file="$env_file"
if [[ "$resolved_env_file" != /* ]]; then
  resolved_env_file="$ROOT_DIR/$resolved_env_file"
fi
[[ -f "$resolved_env_file" ]] || { echo "env file not found: $resolved_env_file" >&2; exit 1; }

log_file="/tmp/${session}.log"
cmd=(bash -lc "cd $(printf '%q' "$ROOT_DIR") && node --env-file=$(printf '%q' "$resolved_env_file") scripts/ops/monitor-live-hero-score.mjs --interval-sec=$(printf '%q' "$interval_sec") --notify=$(printf '%q' "$notify") >> $(printf '%q' "$log_file") 2>&1")

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "${cmd[@]}"

echo "session=$session"
echo "log=$log_file"
