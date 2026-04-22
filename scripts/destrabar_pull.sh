#!/usr/bin/env bash
set -euo pipefail

MODO="${1:-status}" # status | abort

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Este script debe correrse dentro de un repositorio git."
  exit 1
fi

UNMERGED_FILES="$(git diff --name-only --diff-filter=U || true)"
GIT_DIR="$(git rev-parse --git-dir)"
EN_REBASE="false"
if [[ -d "$GIT_DIR/rebase-merge" || -d "$GIT_DIR/rebase-apply" ]]; then
  EN_REBASE="true"
fi

if [[ -z "$UNMERGED_FILES" ]]; then
  echo "✅ No hay conflictos sin resolver. Ya podés hacer git pull."
  exit 0
fi

if [[ "$MODO" == "abort" ]]; then
  if [[ "$EN_REBASE" == "true" ]]; then
    echo "⚠️ Se detectó un rebase en curso. Ejecutando: git rebase --abort"
    git rebase --abort
  else
    echo "⚠️ Se detectó un merge sin resolver. Ejecutando: git merge --abort"
    git merge --abort
  fi
  echo "✅ Operación abortada. Ahora podés actualizar con:"
  echo "   git pull --rebase"
  exit 0
fi

echo "❌ Tenés conflictos sin resolver. Por eso git pull falla."
if [[ "$EN_REBASE" == "true" ]]; then
  echo "📌 Estado detectado: REBASE en curso (no merge normal)."
fi
echo ""
echo "$UNMERGED_FILES"
echo ""
echo "Opciones:"
echo "  A) Resolver y confirmar:"
echo "     git add <archivos>"
if [[ "$EN_REBASE" == "true" ]]; then
  echo "     git rebase --continue"
else
  echo "     git commit -m \"Resuelve conflictos\""
fi
echo "  B) Cancelar merge actual:"
echo "     ./scripts/destrabar_pull.sh abort"
exit 1
