#!/usr/bin/env bash
set -euo pipefail

service="d2hub-sync-opendota-hourly.service"
session="d2hub-sync-opendota-hourly"
log_file="/tmp/d2hub-sync-opendota-hourly.jsonl"

cmd="${1:-status}"

case "$cmd" in
  start)
    systemctl --user start "$service"
    echo "started: $service"
    ;;
  stop)
    systemctl --user stop "$service" || true
    tmux kill-session -t "$session" 2>/dev/null || true
    echo "stopped: $service"
    ;;
  restart)
    systemctl --user restart "$service"
    echo "restarted: $service"
    ;;
  status)
    echo "--- systemd ---"
    systemctl --user --no-pager --full status "$service" || true
    echo
    echo "--- tmux ---"
    tmux ls 2>/dev/null | grep "$session" || echo "session not running: $session"
    echo
    echo "--- log tail ---"
    if [[ -f "$log_file" ]]; then
      tail -n 5 "$log_file"
    else
      echo "log not found: $log_file"
    fi
    ;;
  attach)
    exec tmux attach -t "$session"
    ;;
  logs)
    touch "$log_file"
    exec tail -f "$log_file"
    ;;
  *)
    cat <<EOF
Usage: $0 {start|stop|restart|status|attach|logs}

  start    Start the hourly sync service
  stop     Stop the hourly sync service and tmux session
  restart  Restart the hourly sync service
  status   Show service status, tmux session, and recent logs
  attach   Attach to the tmux session
  logs     Tail the JSONL log file
EOF
    exit 1
    ;;
esac
