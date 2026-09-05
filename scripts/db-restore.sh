#!/usr/bin/env bash
# Restauración de un backup generado por db-backup.sh.
# Uso: npm run db:restore -- backups/oracle_api-20260101-000000.dump
#
# ADVERTENCIA: sobrescribe el contenido actual de la base de datos del
# docker-compose apuntado (--clean --if-exists elimina objetos existentes
# antes de recrearlos). Pensado para restaurar en un entorno local o de
# staging, no para ejecutarse contra producción sin confirmación explícita.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_USER="${POSTGRES_USER:-oracle}"
DB_NAME="${POSTGRES_DB:-oracle_api}"
IN_FILE="${1:?Uso: db-restore.sh <archivo-de-backup>}"

if [ ! -f "$IN_FILE" ]; then
  echo "No existe el archivo de backup: $IN_FILE" >&2
  exit 1
fi

echo "Esto reemplazará el contenido de la base '$DB_NAME'. Escribe 'si' para continuar:"
read -r CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Cancelado."
  exit 1
fi

echo "Restaurando $IN_FILE en '$DB_NAME' ..."
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner \
  < "$IN_FILE"

echo "Restauración completada."
