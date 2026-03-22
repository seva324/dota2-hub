#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
session="d2hub-post-xhs-hourly"
interval_min="60"
timeout_ms="300000"
quiet="1"
log_file=""
post_limit="10"

for arg in "$@"; do
  case "$arg" in
    --session=*) session="${arg#*=}" ;;
    --interval-min=*) interval_min="${arg#*=}" ;;
    --timeout-ms=*) timeout_ms="${arg#*=}" ;;
    --quiet=*) quiet="${arg#*=}" ;;
    --log-file=*) log_file="${arg#*=}" ;;
    --limit=*) post_limit="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[[ "$session" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid session name" >&2 exit 1; }
[[ "$interval_min" =~ ^[0-9]+$ ]] || { echo "interval-min must be numeric" >&2 exit 1; }
[[ "$timeout_ms" =~ ^[0-9]+$ ]] || { echo "timeout-ms must be numeric" >&2 exit 1; }
[[ "$quiet" == "0" || "$quiet" == "1" ]] || { echo "quiet must be 0 or 1" >&2 exit 1; }
[[ "$post_limit" =~ ^[0-9]+$ ]] || { echo "limit must be numeric" >&2 exit 1; }

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

# Add delay to run after news-translate-hourly (starts at minute 0, we start at minute 5)
# Wait 5 minutes on first run, then continue with hourly interval
runner_cmd="cd $(printf '%q' "$ROOT_DIR") && export XHS_AUTO_POST=1 && export XHS_CODEX_MODEL=gpt-5.4-mini && sleep 300 && while true; do printf '\n===== %s XHS post start =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" >> $(printf '%q' "$log_file"); node --env-file=.env.vercel scripts/post-news-to-xhs.mjs --limit $(printf '%q' "$post_limit") >> $(printf '%q' "$log_file") 2>&1; status=\$?; printf '===== %s XHS post exit:%s =====\n' \"\$(date '+%Y-%m-%d %H:%M:%S %Z')\" \"\$status\" >> $(printf '%q' "$log_file"); sleep $(printf '%q' "$(( interval_min * 60 ))"); done"

tmux kill-session -t "$session" 2>/dev/null || true
tmux new-session -d -s "$session" "bash -lc $(printf '%q' "$runner_cmd")"

echo "session=$session"
echo "post_limit=$post_limit"
echo "interval_min=$interval_min"
echo "log=$log_file"
echo "attach=tmux attach -t $session"
echo "stop=tmux kill-session -t $session"
