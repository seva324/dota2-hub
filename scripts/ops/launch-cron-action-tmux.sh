#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/seva324/dota2-hub"
cd "$ROOT_DIR"

name=""
action=""
base="https://dota2-hub.vercel.app"
timeout_ms="120000"
notify="1"

for arg in "$@"; do
  case "$arg" in
    --name=*) name="${arg#*=}" ;;
    --action=*) action="${arg#*=}" ;;
    --base=*) base="${arg#*=}" ;;
    --timeout-ms=*) timeout_ms="${arg#*=}" ;;
    --notify=*) notify="${arg#*=}" ;;
  esac
done

if [[ -z "$name" || -z "$action" ]]; then
  echo "Usage: $0 --name=<job-name> --action=<cron-action> [--base=URL] [--timeout-ms=120000] [--notify=1]" >&2
  exit 1
fi

session="d2hub-cron-${name}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
log_file="/tmp/${session}-${stamp}.log"
json_log="/tmp/${session}.jsonl"

if tmux has-session -t "$session" 2>/dev/null; then
  pane_dead="$(tmux list-panes -t "$session" -F '#{pane_dead}' 2>/dev/null | head -n 1 || true)"
  if [[ "$pane_dead" == "1" ]]; then
    tmux kill-session -t "$session" 2>/dev/null || true
  else
    echo "[$(date -u +%FT%TZ)] session ${session} already running; skip" >> "$log_file"
    exit 0
  fi
fi

cmd="cd $ROOT_DIR && node --env-file=.env.local scripts/ops/run-cron-action-once.mjs --action=$action --base=$base --timeout-ms=$timeout_ms --notify=$notify --log=$json_log >> $log_file 2>&1"

tmux new-session -d -s "$session" "$cmd"

echo "$session"
echo "$log_file"
