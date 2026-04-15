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
translate_model="gemma4"
sync_news_log=""
sync_poll_sec="15"
run_on_start="1"
ensure_only="0"

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --interval-min=*) interval_min="${arg#*=}" ;;
    --log-file=*) log_file="${arg#*=}" ;;
    --limit=*) translate_limit="${arg#*=}" ;;
    --batch=*) translate_batch="${arg#*=}" ;;
    --recent-days=*) recent_days="${arg#*=}" ;;
    --env-file=*) env_file="${arg#*=}" ;;
    --translate-model=*) translate_model="${arg#*=}" ;;
    --codex-model=*) translate_model="${arg#*=}" ;;
    --sync-news-log=*) sync_news_log="${arg#*=}" ;;
    --sync-poll-sec=*) sync_poll_sec="${arg#*=}" ;;
    --run-on-start=*) run_on_start="${arg#*=}" ;;
    --ensure-only=*) ensure_only="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2; exit 1; }
[[ "$interval_min" =~ ^[0-9]+$ ]] || { echo "interval-min must be numeric" >&2; exit 1; }
[[ "$translate_limit" =~ ^[0-9]+$ ]] || { echo "limit must be numeric" >&2; exit 1; }
[[ "$translate_batch" =~ ^[0-9]+$ ]] || { echo "batch must be numeric" >&2; exit 1; }
[[ "$recent_days" =~ ^[0-9]+$ ]] || { echo "recent-days must be numeric" >&2; exit 1; }
[[ "$sync_poll_sec" =~ ^[0-9]+$ ]] || { echo "sync-poll-sec must be numeric" >&2; exit 1; }
[[ "$run_on_start" == "0" || "$run_on_start" == "1" ]] || { echo "run-on-start must be 0 or 1" >&2; exit 1; }
[[ "$ensure_only" == "0" || "$ensure_only" == "1" ]] || { echo "ensure-only must be 0 or 1" >&2; exit 1; }
[[ -n "$translate_model" ]] || { echo "translate-model must be non-empty" >&2; exit 1; }

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
if [[ -z "$sync_news_log" ]]; then
  if [[ -f "/tmp/d2hub-cron-news.jsonl" ]]; then
    sync_news_log="/tmp/d2hub-cron-news.jsonl"
  elif [[ -f "/tmp/d2hub-cron-sync-news.jsonl" ]]; then
    sync_news_log="/tmp/d2hub-cron-sync-news.jsonl"
  else
    sync_news_log="/tmp/d2hub-cron-news.jsonl"
  fi
elif [[ "$sync_news_log" != /* ]]; then
  sync_news_log="$ROOT_DIR/$sync_news_log"
fi

if tmux has-session -t "$session" 2>/dev/null; then
  if [[ "$ensure_only" == "1" ]]; then
    echo "session=$session"
    echo "status=already_running"
    echo "attach=tmux attach -t $session"
    exit 0
  fi
  tmux kill-session -t "$session"
fi

node_cmd="node"
if [[ -n "$resolved_env_file" ]]; then
  node_cmd="node --env-file=$(printf '%q' "$resolved_env_file")"
fi

runner_cmd="cd $(printf '%q' "$ROOT_DIR") && export XHS_AUTO_POST=0 && export NEWS_TRANSLATE_MODEL=$(printf '%q' "$translate_model") && sync_news_log=$(printf '%q' "$sync_news_log") && sync_poll_sec=$(printf '%q' "$sync_poll_sec") && run_on_start=$(printf '%q' "$run_on_start") && get_latest_sync_line() { [[ -f \"\$sync_news_log\" ]] || return 0; tail -n 200 \"\$sync_news_log\" | grep '\"action\":\"sync-news\"' | grep '\"ok\":true' | grep -v '\"skipped\":true' | tail -n 1 || true; } && run_translate() { reason=\"\$1\"; printf '\n===== %s local translate start (reason:%s) =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"\$reason\" >> $(printf '%q' "$log_file"); ${node_cmd} scripts/translate-news-style-zh.mjs --limit $(printf '%q' "$translate_limit") --batch $(printf '%q' "$translate_batch") --recentDays $(printf '%q' "$recent_days") >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s local translate exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"\$status\" >> $(printf '%q' "$log_file"); return 0; } && last_sync_line=\"\$(get_latest_sync_line)\" && if [[ \"\$run_on_start\" == \"1\" ]]; then run_translate startup; fi && while true; do latest_sync_line=\"\$(get_latest_sync_line)\"; if [[ -n \"\$latest_sync_line\" && \"\$latest_sync_line\" != \"\$last_sync_line\" ]]; then last_sync_line=\"\$latest_sync_line\"; run_translate sync-news-finished; fi; sleep \"\$sync_poll_sec\"; done"

tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "translate_limit=$translate_limit"
echo "translate_batch=$translate_batch"
echo "recent_days=$recent_days"
echo "env_file=${resolved_env_file:-<process-env>}"
echo "translate_model=$translate_model"
echo "sync_news_log=$sync_news_log"
echo "sync_poll_sec=$sync_poll_sec"
echo "run_on_start=$run_on_start"
echo "ensure_only=$ensure_only"
echo "interval_min_compat=$interval_min (unused, kept for backward compatibility)"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
