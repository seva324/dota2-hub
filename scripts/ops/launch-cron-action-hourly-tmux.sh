#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

name=""
action=""
interval_hours=""
base="https://dota2-hub.vercel.app"
timeout_ms="180000"
notify="1"

for arg in "$@"; do
  case "$arg" in
    --name=*) name="${arg#*=}" ;;
    --action=*) action="${arg#*=}" ;;
    --interval-hours=*) interval_hours="${arg#*=}" ;;
    --base=*) base="${arg#*=}" ;;
    --timeout-ms=*) timeout_ms="${arg#*=}" ;;
    --notify=*) notify="${arg#*=}" ;;
  esac
done

if [[ -z "$name" || -z "$action" ]]; then
  echo "Usage: $0 --name=<job-name> --action=<cron-action> [--interval-hours=<hours>] [--base=URL] [--timeout-ms=180000] [--notify=1]" >&2
  exit 1
fi

if [[ -z "$interval_hours" ]]; then
  if [[ "$action" == "sync-news" ]]; then
    interval_hours=1
  else
    interval_hours=3
  fi
fi

session="d2hub-cron-${name}"
log_file="/tmp/${session}.log"
json_log="/tmp/${session}.jsonl"

interval_sec=$(( interval_hours * 3600 ))

runner_cmd="cd $(printf '%q' "$ROOT_DIR") && while true; do stamp=\$(date -u +%Y%m%dT%H%M%SZ); printf '\n===== %s cron %s start =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"$action\" >> $(printf '%q' "$log_file"); node --env-file=.env.local scripts/ops/run-cron-action-once.mjs --action=$action --base=$base --timeout-ms=$timeout_ms --notify=$notify --log=$json_log >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s cron %s exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"$action\" \"\$status\" >> $(printf '%q' "$log_file"); sleep $interval_sec; done"

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "action=$action"
echo "interval_hours=$interval_hours"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
