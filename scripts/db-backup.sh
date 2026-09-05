#!/usr/bin/env bash
# Backup de la base de datos Postgres del docker-compose local/staging.
# Uso: npm run db:backup  (o ./scripts/db-backup.sh [nombre-opcional])
set -euo pipefail

cd "$(dirname "$0")/.."

DB_USER="${POSTGRES_USER:-oracle}"
DB_NAME="${POSTGRES_DB:-oracle_api}"
OUT_DIR="backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${1:-$OUT_DIR/oracle_api-$STAMP.dump}"

mkdir -p "$OUT_DIR"

echo "Generando backup de '$DB_NAME' en $OUT_FILE ..."
docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom \
  > "$OUT_FILE"

echo "Backup completado: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
