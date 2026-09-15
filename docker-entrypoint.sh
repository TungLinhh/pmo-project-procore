#!/bin/bash
# PMO Docker entrypoint — wait for PG, ensure schema+seed, then exec CMD.
# Idempotent: init-db skips if tenants table already exists.
# Called by compose `init` service (one-shot) AND by app entrypoint.
# On the app service, the `init` service runs first (depends_on), so this
# re-run is a no-op — but it's kept as a safety net for direct `docker run`.
set -e

echo "=== PMO Docker entrypoint ==="
cd /app

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

# No DATABASE_URL export here: the backend builds it from DB_* itself
# (buildDatabaseUrl). Exporting a hand-built URL risks leaking or mangling
# the password — let the app own connection-string construction.

# Apply migrations + seed (idempotent). FATAL on failure — never boot on a half-migrated DB.
echo "Initializing database..."
node backend/src/db/init.js
echo "✓ init ok"

echo "=== Starting backend ==="
exec "$@"