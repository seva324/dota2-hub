#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
session="d2hub-post-wechat-hourly"
interval_min="60"
env_file=".env.vercel"
log_file=""
draft_limit="5"

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --interval-min=*) interval_min="${arg#*=}" ;;
    --env-file=*) env_file="${arg#*=}" ;;
    --log-file=*) log_file="${arg#*=}" ;;
    --limit=*) draft_limit="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2; exit 1; }
[[ "$interval_min" =~ ^[0-9]+$ ]] || { echo "interval-min must be numeric" >&2; exit 1; }
[[ "$draft_limit" =~ ^[0-9]+$ ]] || { echo "limit must be numeric" >&2; exit 1; }

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

hydrate_wechat_env() {
  if [[ -n "${WECHAT_APP_ID:-}" && -n "${WECHAT_APP_SECRET:-}" ]]; then
    return 0
  fi

  [[ -f "$HOME/.zshrc" ]] || return 0

  while IFS= read -r assignment; do
    [[ "$assignment" == *=* ]] || continue
    export "$assignment"
  done < <(
    /bin/zsh -lc '
      source ~/.zshrc >/dev/null 2>&1 || true
      printf "WECHAT_APP_ID=%q\n" "${WECHAT_APP_ID:-}"
      printf "WECHAT_APP_SECRET=%q\n" "${WECHAT_APP_SECRET:-}"
    '
  )
}

hydrate_wechat_env

if [[ -n "${WECHAT_APP_ID:-}" ]]; then
  tmux set-environment -g WECHAT_APP_ID "$WECHAT_APP_ID"
fi
if [[ -n "${WECHAT_APP_SECRET:-}" ]]; then
  tmux set-environment -g WECHAT_APP_SECRET "$WECHAT_APP_SECRET"
fi

node_cmd="node"
if [[ -n "$resolved_env_file" ]]; then
  node_cmd="node --env-file=$(printf '%q' "$resolved_env_file")"
fi

runner_cmd="cd $(printf '%q' "$ROOT_DIR") && while true; do printf '\n===== %s WeChat draft start =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" >> $(printf '%q' "$log_file"); ${node_cmd} scripts/post-news-to-wechat-drafts.mjs --limit $(printf '%q' "$draft_limit") >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s WeChat draft exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"\$status\" >> $(printf '%q' "$log_file"); sleep $(printf '%q' "$(( interval_min * 60 ))"); done"

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "draft_limit=$draft_limit"
echo "interval_min=$interval_min"
echo "env_file=${resolved_env_file:-<none>}"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
