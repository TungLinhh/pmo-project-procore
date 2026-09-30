#!/bin/bash
# PMO PostgreSQL control script
# PG data dir: <repo>/data/pgdata
# PG binary: PATH (override with PGBIN=/absolute/path/to/bin)
# Port: 5433 (5432 conflict với WSL2 forward)

set -e

# Tìm `pg_ctl`. Chỉ dựa vào `PATH` thì **chạy được trong shell nhưng hỏng dưới systemd
# user unit**, vì unit có PATH tối giản (`/usr/local/bin:/usr/bin:/bin:...`) không có
# Homebrew. Đo 2026-09-30: `pg-ctl.sh start` gõ tay thì OK, còn `pmo-db.service` fail
# ngay với "PostgreSQL binaries not found" — tức unit Postgres không bao giờ lên được.
# Nên phải có danh sách dự phòng, và phải **in ra tất cả** chỗ đã thử khi không tìm
# thấy, thay vì một dòng chung chung khiến người đọc tưởng máy chưa cài Postgres.
PG_BIN="${PGBIN:-}"
if [ -z "$PG_BIN" ]; then
  for cand in $(command -v pg_ctl 2>/dev/null) \
               /home/linuxbrew/.linuxbrew/bin/pg_ctl \
               /usr/local/bin/pg_ctl /usr/lib/postgresql/*/bin/pg_ctl \
               /opt/homebrew/bin/pg_ctl /usr/bin/pg_ctl; do
    if [ -x "$cand" ]; then PG_BIN="$(dirname "$cand")"; break; fi
  done
fi
if [ -z "$PG_BIN" ] || [ ! -x "$PG_BIN/pg_ctl" ]; then
  {
    echo "Không tìm thấy pg_ctl. Đã thử:"
    echo "  - biến PGBIN (đặt: PGBIN=/đường/dẫn/tới/bin)"
    echo "  - pg_ctl trên PATH"
    echo "  - /home/linuxbrew/.linuxbrew/bin, /usr/local/bin, /opt/homebrew/bin"
    echo "  - /usr/lib/postgresql/*/bin, /usr/bin"
    echo "Cài PostgreSQL client (vd: brew install postgresql@16) hoặc đặt PGBIN."
  } >&2
  exit 1
fi
# `PG_DATA` cho phép ghi đè để bài kiểm dựng data dir giả. Mặc định vẫn là data dir
# trong repo; bài kiểm **không** được chạm vào dữ liệu thật.
PG_DATA="${PG_DATA:-$(cd "$(dirname "$0")/../../data/pgdata" && pwd)}"
PG_LOG="$PG_DATA/pg.log"
PG_PORT="${PG_PORT:-5433}"

# Sống hay chết phải trả lời bằng **cổng**, không phải bằng sự tồn tại của
# `postmaster.pid`. Bản đầu kiểm `[ -f postmaster.pid ]` rồi in "already running":
# sau khi máy reboot hoặc postmaster bị kill, file vẫn còn nguyên nên `start` trở thành
# no-op **báo thành công** trong khi Postgres đã chết. Đo 2026-09-30: sau một đêm
# không ai đăng nhập được, `pg-ctl.sh start` in "PG already running" và
# `pg_isready` trả "no response" — tức lệnh khôi phục trong runbook không chạy được.
pg_is_up() { $PG_BIN/pg_isready -h 127.0.0.1 -p "$PG_PORT" -q 2>/dev/null; }

# Dọn `postmaster.pid` sót lại. Chỉ xoá khi PID trong file **đã chết** — nếu process
# còn sống thì xoá lock file sẽ cho phép `pg_ctl` khởi động một postmaster thứ hai
# trên cùng data dir, tức hỏng dữ liệu.
drop_stale_pid() {
  [ -f "$PG_DATA/postmaster.pid" ] || return 0
  local oldpid
  oldpid=$(head -1 "$PG_DATA/postmaster.pid" 2>/dev/null | tr -dc '0-9')
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
    echo "postmaster.pid giữ pid $oldpid còn sống — không xoá (sẽ hỏng data dir)" >&2
    return 1
  fi
  echo "Dọn postmaster.pid cũ (pid ${oldpid:-không rõ} không còn sống)"
  rm -f "$PG_DATA/postmaster.pid"
}

case "${1:-status}" in
  start)
    if pg_is_up; then
      echo "PG already running on 127.0.0.1:$PG_PORT"
    else
      # `pg_ctl start` tự dọn lock file cũ khi pid đã chết, nhưng chỉ khi nó đọc được
      # pid hợp lệ; gọi `drop_stale_pid` trước cho trường hợp file hỏng (pid rỗng).
      drop_stale_pid || exit 1
      $PG_BIN/pg_ctl -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT" start
      # Không tin `pg_ctl` báo thành công: nó có thể in "server started" rồi chết ngay
      # (data dir hỏng, hết dung lượng, port bận). Xác nhận bằng cổng.
      for _ in $(seq 1 30); do
        pg_is_up && break
        sleep 1
      done
      pg_is_up || { echo "Postgres không lên cổng $PG_PORT sau 30s — xem: $0 logs" >&2; exit 1; }
    fi
    ;;
  stop)
    if pg_is_up || [ -f "$PG_DATA/postmaster.pid" ]; then
      $PG_BIN/pg_ctl -D "$PG_DATA" -m fast stop
    else
      echo "PG: nothing to stop"
    fi
    ;;
  restart)
    $PG_BIN/pg_ctl -D "$PG_DATA" -m fast stop
    sleep 2
    $PG_BIN/pg_ctl -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT" start
    ;;
  status)
    if pg_is_up; then
      echo "PG: running on 127.0.0.1:$PG_PORT (data: $PG_DATA)"
      ps aux | grep -E "postgres.*$PG_DATA" | grep -v grep | awk '{print "  pid:", $2, "started:", $9}'
    elif [ -f "$PG_DATA/postmaster.pid" ]; then
      # Không lắng nghe cổng mà vẫn còn pid file = postmaster chết non, dữ liệu có thể
      # cần khôi phục. Gọi nó là "stopped" sẽ giấu mất sự cố.
      echo "PG: NOT running (nhưng còn postmaster.pid cũ — chạy '$0 start' sẽ dọn và khởi động lại)"
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
