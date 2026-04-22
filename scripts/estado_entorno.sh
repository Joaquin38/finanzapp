#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  UNMERGED_FILES="$(git diff --name-only --diff-filter=U || true)"
  if [[ -n "$UNMERGED_FILES" ]]; then
    echo "❌ Hay conflictos de merge sin resolver. Git no te va a dejar hacer pull."
    echo ""
    echo "$UNMERGED_FILES"
    echo ""
    echo "Opciones:"
    echo "  1) Resolver y confirmar:"
    echo "     git add <archivos>"
    echo "     git commit -m \"Resuelve conflictos\""
    echo "  2) Cancelar merge en curso:"
    echo "     git merge --abort"
    exit 1
  fi
fi

docker compose ps

echo "\n--- Últimos logs de postgres ---"
docker compose logs --tail=80 postgres
