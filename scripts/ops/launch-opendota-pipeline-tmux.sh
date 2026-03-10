#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/seva324/dota2-hub"
cd "$ROOT_DIR"

session="d2hub-cron-opendota"
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

cmd="cd $ROOT_DIR && node --env-file=.env.local scripts/ops/run-opendota-sync-pipeline-once.mjs --notify=1 --log=$json_log >> $log_file 2>&1"

tmux new-session -d -s "$session" "$cmd"

echo "$session"
echo "$log_file"
