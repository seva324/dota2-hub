#!/usr/bin/env bash
set -euo pipefail

# launchd / 非登录 shell 的 PATH 不含 /usr/local/bin（tmux 所在），显式补上
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

name=""
action=""
interval_hours=""
interval_min=""
base="https://dotahub.cn"
timeout_ms="180000"
notify="1"
only_source=""

for arg in "$@"; do
  case "$arg" in
    --name=*) name="${arg#*=}" ;;
    --action=*) action="${arg#*=}" ;;
    --interval-hours=*) interval_hours="${arg#*=}" ;;
    --interval-min=*) interval_min="${arg#*=}" ;;
    --base=*) base="${arg#*=}" ;;
    --timeout-ms=*) timeout_ms="${arg#*=}" ;;
    --notify=*) notify="${arg#*=}" ;;
    --only-source=*) only_source="${arg#*=}" ;;
  esac
done

if [[ -z "$name" || -z "$action" ]]; then
  echo "Usage: $0 --name=<job-name> --action=<cron-action> [--interval-hours=<hours>|--interval-min=<minutes>] [--base=URL] [--timeout-ms=180000] [--notify=1] [--only-source=<source>]" >&2
  exit 1
fi

if [[ -z "$interval_hours" && -z "$interval_min" ]]; then
  if [[ "$action" == "sync-news" ]]; then
    interval_hours=1
  else
    interval_hours=3
  fi
fi

session="d2hub-cron-${name}"
log_file="/tmp/${session}.log"
json_log="/tmp/${session}.jsonl"

if [[ -n "$interval_min" ]]; then
  interval_sec=$(( interval_min * 60 ))
else
  interval_sec=$(( interval_hours * 3600 ))
fi

only_source_flag=""
if [[ -n "$only_source" ]]; then
  only_source_flag="--only-source=$(printf '%q' "$only_source")"
fi

# Run sync-news locally so onlySource filtering works (deployment may lag)
local_flag=""
if [[ "$action" == "sync-news" ]]; then
  local_flag="--local=1"
fi

runner_cmd="cd $(printf '%q' "$ROOT_DIR") && while true; do stamp=\$(date -u +%Y%m%dT%H%M%SZ); printf '\n===== %s cron %s start =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"$action\" >> $(printf '%q' "$log_file"); node --env-file=.env.local scripts/ops/run-cron-action-once.mjs --action=$action --base=$base --timeout-ms=$timeout_ms --notify=$notify $local_flag $only_source_flag --log=$json_log >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s cron %s exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"$action\" \"\$status\" >> $(printf '%q' "$log_file"); sleep $interval_sec; done"

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "action=$action"
echo "interval_sec=$interval_sec"
echo "base=$base"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
