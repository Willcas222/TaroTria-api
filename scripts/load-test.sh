#!/usr/bin/env bash
# Prueba de carga básica (smoke, no de capacidad): confirma que la API
# sostiene concurrencia sin caerse ni filtrar recursos, y que el
# rate limiting global (100 req/min/IP) reacciona como se espera.
# Uso: npm run test:load  (requiere la API corriendo en API_URL, por
# defecto http://localhost:3000/api/v1)
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000/api/v1}"
DURATION="${LOAD_TEST_DURATION:-15}"
CONNECTIONS="${LOAD_TEST_CONNECTIONS:-20}"

echo "Objetivo: $API_URL/health"
echo "Duración: ${DURATION}s · Conexiones concurrentes: ${CONNECTIONS}"
echo

npx autocannon -c "$CONNECTIONS" -d "$DURATION" "$API_URL/health"

echo
echo "Nota: es normal ver una alta proporción de 429 pasado el primer minuto:"
echo "el ThrottlerGuard global limita a 100 solicitudes/min por IP."
