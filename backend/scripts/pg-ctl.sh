#!/bin/bash
# PMO PostgreSQL control script
# PG data dir: pmo_project/data/pgdata
# PG binary: /home/linuxbrew/.linuxbrew/Cellar/postgresql@16/16.15/bin
# Port: 5433 (5432 conflict với WSL2 forward)

set -e

PG_BIN="/home/linuxbrew/.linuxbrew/Cellar/postgresql@16/16.15/bin"
PG_DATA="$(cd "$(dirname "$0")/../../data/pgdata" && pwd)"
PG_LOG="$PG_DATA/pg.log"
PG_PORT="${PG_PORT:-5433}"

case "${1:-status}" in
  start)
    if [ -f "$PG_DATA/postmaster.pid" ]; then
      echo "PG already running (pid file exists)"
      $PG_BIN/pg_isready -h 127.0.0.1 -p $PG_PORT
    else
      $PG_BIN/pg_ctl -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT" start
    fi
    ;;
  stop)
    $PG_BIN/pg_ctl -D "$PG_DATA" -m fast stop
    ;;
  restart)
    $PG_BIN/pg_ctl -D "$PG_DATA" -m fast stop
    sleep 2
    $PG_BIN/pg_ctl -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT" start
    ;;
  status)
    if $PG_BIN/pg_isready -h 127.0.0.1 -p $PG_PORT -q 2>/dev/null; then
      echo "PG: running on 127.0.0.1:$PG_PORT (data: $PG_DATA)"
      ps aux | grep -E "postgres.*$PG_DATA" | grep -v grep | awk '{print "  pid:", $2, "started:", $9}'
    else
      echo "PG: NOT running"
    fi
    ;;
  logs)
    tail -50 "$PG_LOG" 2>&1 || echo "No log file at $PG_LOG"
    ;;
  backup)
    OUT="${2:-backup-$(date +%Y%m%d-%H%M%S).sql}"
    PGPASSWORD=pmo_dev_pwd $PG_BIN/pg_dump -h 127.0.0.1 -p $PG_PORT -U pmo_user -d pmo -F c -f "$OUT"
    echo "Backup saved: $OUT ($(du -h "$OUT" | cut -f1))"
    ;;
  psql)
    PGPASSWORD=pmo_dev_pwd $PG_BIN/psql -h 127.0.0.1 -p $PG_PORT -U pmo_user -d pmo "${@:2}"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|backup [file]|psql [args...]}"
    exit 1
    ;;
esac
