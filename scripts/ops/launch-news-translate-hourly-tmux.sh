#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
session="d2hub-news-translate-hourly"
interval_min="60"
log_file=""
translate_limit="24"
translate_batch="6"
recent_days="3"
env_file=".env.vercel"
codex_model="gpt-5.4-mini"

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --interval-min=*) interval_min="${arg#*=}" ;;
    --log-file=*) log_file="${arg#*=}" ;;
    --limit=*) translate_limit="${arg#*=}" ;;
    --batch=*) translate_batch="${arg#*=}" ;;
    --recent-days=*) recent_days="${arg#*=}" ;;
    --env-file=*) env_file="${arg#*=}" ;;
    --codex-model=*) codex_model="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2; exit 1; }
[[ "$interval_min" =~ ^[0-9]+$ ]] || { echo "interval-min must be numeric" >&2; exit 1; }
[[ "$translate_limit" =~ ^[0-9]+$ ]] || { echo "limit must be numeric" >&2; exit 1; }
[[ "$translate_batch" =~ ^[0-9]+$ ]] || { echo "batch must be numeric" >&2; exit 1; }
[[ "$recent_days" =~ ^[0-9]+$ ]] || { echo "recent-days must be numeric" >&2; exit 1; }
[[ -n "$codex_model" ]] || { echo "codex-model must be non-empty" >&2; exit 1; }

resolved_env_file=""
if [[ -n "$env_file" ]]; then
  resolved_env_file="$env_file"
  if [[ "$resolved_env_file" != /* ]]; then
    resolved_env_file="$ROOT_DIR/$resolved_env_file"
  fi
  [[ -f "$resolved_env_file" ]] || { echo "env file not found: $resolved_env_file" >&2; exit 1; }
fi

if [[ -z "$log_file" ]]; then
  log_file="/tmp/${session}.log"
fi

if [[ "$log_file" != /* ]]; then
  log_file="$ROOT_DIR/$log_file"
fi

mkdir -p "$(dirname "$log_file")"

node_cmd="node"
if [[ -n "$resolved_env_file" ]]; then
  node_cmd="node --env-file=$(printf '%q' "$resolved_env_file")"
fi

runner_cmd="cd $(printf '%q' "$ROOT_DIR") && export XHS_AUTO_POST=0 && export NEWS_TRANSLATE_CODEX_MODEL=$(printf '%q' "$codex_model") && while true; do printf '\n===== %s local translate start =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" >> $(printf '%q' "$log_file"); ${node_cmd} scripts/translate-news-style-zh.mjs --limit $(printf '%q' "$translate_limit") --batch $(printf '%q' "$translate_batch") --recentDays $(printf '%q' "$recent_days") >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s local translate exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"\$status\" >> $(printf '%q' "$log_file"); sleep $(printf '%q' "$(( interval_min * 60 ))"); done"

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "translate_limit=$translate_limit"
echo "translate_batch=$translate_batch"
echo "recent_days=$recent_days"
echo "env_file=${resolved_env_file:-<process-env>}"
echo "codex_model=$codex_model"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
