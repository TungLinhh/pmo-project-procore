#!/bin/bash
# PMO Docker entrypoint — wait for PG, ensure schema+seed, then exec CMD.
# Idempotent: init-db skips if tenants table already exists.
# The demo app runs init as a safety net. Production sets SKIP_DB_INIT=1 after
# the dedicated one-shot init service has completed.
set -e

echo "=== PMO Docker entrypoint ==="
cd /app

if [ "${SKIP_DB_INIT:-0}" = "1" ]; then
  echo "Skipping database init; one-shot init service must have completed"
else
  # Wait for Postgres (max 60s)
  if [ -n "$DB_HOST" ]; then
    echo "Waiting for Postgres at $DB_HOST:${DB_PORT:-5432}..."
    for i in $(seq 1 60); do
      if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        echo "✓ Postgres ready"
        break
      fi
      if [ "$i" -eq 60 ]; then
        echo "❌ Postgres not ready after 60s — aborting"
        exit 1
      fi
      sleep 1
    done
  fi

  # The backend owns DB URL construction. Keep owner credentials in the one-shot
  # init service, not in the long-running request process.
  echo "Initializing database..."
  node backend/src/db/init.js
  echo "✓ init ok"
fi

echo "=== Starting backend ==="
exec "$@"