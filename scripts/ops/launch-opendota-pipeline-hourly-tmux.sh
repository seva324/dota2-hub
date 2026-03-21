#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
session="d2hub-opendota-pipeline"
interval_hours="1"
log_file=""
post_limit="10"

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --interval-hours=*) interval_hours="${arg#*=}" ;;
    --log-file=*) log_file="${arg#*=}" ;;
    --limit=*) post_limit="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2 exit 1; }
[[ "$interval_hours" =~ ^[0-9]+$ ]] || { echo "interval-hours must be numeric" >&2 exit 1; }

if [[ -z "$log_file" ]]; then
  log_file="/tmp/${session}.log"
fi

if [[ "$log_file" != /* ]]; then
  log_file="$ROOT_DIR/$log_file"
fi

mkdir -p "$(dirname "$log_file")"

interval_sec=$(( interval_hours * 3600 ))

runner_cmd="cd $(printf '%q' "$ROOT_DIR") && while true; do printf '\n===== %s opendota pipeline start =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" >> $(printf '%q' "$log_file"); node --env-file=.env.local scripts/ops/run-opendota-sync-pipeline-once.mjs --notify=1 >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s opendota pipeline exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"\$status\" >> $(printf '%q' "$log_file"); sleep $interval_sec; done"

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "interval_hours=$interval_hours"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
