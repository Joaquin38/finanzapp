#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker no está instalado o no está en PATH."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "ℹ️  Se creó .env desde .env.example"
fi

echo "[1/4] Levantando PostgreSQL..."
docker compose up -d

echo "[2/4] Esperando que PostgreSQL esté saludable..."
for _ in $(seq 1 30); do
  estado=$(docker inspect --format='{{json .State.Health.Status}}' finanzas_postgres 2>/dev/null | tr -d '"' || true)
  if [ "$estado" = "healthy" ]; then
    break
  fi
  sleep 2
done

echo "[3/4] Estado actual de servicios"
docker compose ps

echo "[4/4] Verificando conexión a la DB"
docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-finanzas}" -d "${POSTGRES_DB:-finanzas_db}"

echo "✅ Entorno listo"
echo "🔌 DBeaver => Host: ${POSTGRES_HOST:-localhost} | Puerto: ${POSTGRES_PORT:-5432} | DB: ${POSTGRES_DB:-finanzas_db} | User: ${POSTGRES_USER:-finanzas}"
