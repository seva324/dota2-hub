#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
session="d2hub-news-translate-hourly"
base_url="https://dota2-hub.vercel.app"
interval_min="60"
timeout_ms="420000"
quiet="1"
env_file=".env.local"
log_file=""
mode="local"
limit="24"
batch="6"
recent_days="3"
codex_model="gpt-5.1-codex-mini"

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --mode=*) mode="${arg#*=}" ;;
    --base-url=*) base_url="${arg#*=}" ;;
    --interval-min=*) interval_min="${arg#*=}" ;;
    --timeout-ms=*) timeout_ms="${arg#*=}" ;;
    --quiet=*) quiet="${arg#*=}" ;;
    --env-file=*) env_file="${arg#*=}" ;;
    --log-file=*) log_file="${arg#*=}" ;;
    --limit=*) limit="${arg#*=}" ;;
    --batch=*) batch="${arg#*=}" ;;
    --recent-days=*) recent_days="${arg#*=}" ;;
    --codex-model=*) codex_model="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2; exit 1; }
[[ "$mode" == "local" || "$mode" == "remote" ]] || { echo "mode must be local or remote" >&2; exit 1; }
[[ "$interval_min" =~ ^[0-9]+$ ]] || { echo "interval-min must be numeric" >&2; exit 1; }
[[ "$timeout_ms" =~ ^[0-9]+$ ]] || { echo "timeout-ms must be numeric" >&2; exit 1; }
[[ "$quiet" == "0" || "$quiet" == "1" ]] || { echo "quiet must be 0 or 1" >&2; exit 1; }
[[ "$limit" =~ ^[0-9]+$ ]] || { echo "limit must be numeric" >&2; exit 1; }
[[ "$batch" =~ ^[0-9]+$ ]] || { echo "batch must be numeric" >&2; exit 1; }
[[ "$recent_days" =~ ^[0-9]+$ ]] || { echo "recent-days must be numeric" >&2; exit 1; }
[[ -n "$codex_model" ]] || { echo "codex-model must be non-empty" >&2; exit 1; }

base_url="${base_url%/}"
endpoint="translate-news-backfill|${base_url}/api/cron?action=translate-news-backfill"

resolved_env_file=""
if [[ -n "$env_file" ]]; then
  resolved_env_file="$env_file"
  if [[ "$resolved_env_file" != /* ]]; then
    resolved_env_file="$ROOT_DIR/$resolved_env_file"
  fi
  [[ -f "$resolved_env_file" ]] || { echo "env file not found: $resolved_env_file" >&2; exit 1; }
fi

if [[ -z "$log_file" ]]; then
  if [[ "$mode" == "local" ]]; then
    log_file="/tmp/${session}.log"
  else
    log_file="/tmp/${session}.jsonl"
  fi
fi

if [[ "$log_file" != /* ]]; then
  log_file="$ROOT_DIR/$log_file"
fi

mkdir -p "$(dirname "$log_file")"

node_cmd="node"
if [[ -n "$resolved_env_file" ]]; then
  node_cmd="node --env-file=$(printf '%q' "$resolved_env_file")"
fi

if [[ "$mode" == "local" ]]; then
  runner_cmd="cd $(printf '%q' "$ROOT_DIR") && export XHS_AUTO_POST=0 && export NEWS_TRANSLATE_CODEX_MODEL=$(printf '%q' "$codex_model") && while true; do printf '\n===== %s local translate start =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" >> $(printf '%q' "$log_file"); ${node_cmd} scripts/translate-news-style-zh.mjs --limit $(printf '%q' "$limit") --batch $(printf '%q' "$batch") --recentDays $(printf '%q' "$recent_days") >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s local translate exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"\$status\" >> $(printf '%q' "$log_file"); sleep $(printf '%q' "$(( interval_min * 60 ))"); done"
else
  runner_cmd="cd $(printf '%q' "$ROOT_DIR") && ${node_cmd} scripts/ops/hourly-cron-refresh.mjs --endpoints=$(printf '%q' "$endpoint") --interval-min=$(printf '%q' "$interval_min") --timeout-ms=$(printf '%q' "$timeout_ms") --log=$(printf '%q' "$log_file")"
  if [[ "$quiet" == "1" ]]; then
    runner_cmd+=" --quiet"
  fi
fi

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "mode=$mode"
if [[ "$mode" == "remote" ]]; then
  echo "endpoint=$endpoint"
else
  echo "translate_limit=$limit"
  echo "translate_batch=$batch"
  echo "recent_days=$recent_days"
  echo "codex_model=$codex_model"
fi
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
