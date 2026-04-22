#!/usr/bin/env bash
set -euo pipefail

# Resetea la base local eliminando volumen y recreando contenedor.
# ADVERTENCIA: borra todos los datos locales de PostgreSQL.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/3] Deteniendo servicios..."
docker compose down

echo "[2/3] Eliminando volumen postgres_data..."
docker volume rm finanzas-app_postgres_data >/dev/null 2>&1 || true

echo "[3/3] Iniciando PostgreSQL limpio..."
docker compose up -d

echo "Base reiniciada. El esquema se aplica automáticamente al primer arranque."
