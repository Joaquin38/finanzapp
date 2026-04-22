$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

if (git rev-parse --is-inside-work-tree 2>$null) {
  $unmergedFiles = git diff --name-only --diff-filter=U
  if ($unmergedFiles) {
    Write-Host "❌ Hay conflictos de merge sin resolver. Git no te va a dejar hacer pull." -ForegroundColor Red
    Write-Host ""
    $unmergedFiles | ForEach-Object { Write-Host $_ }
    Write-Host ""
    Write-Host "Opciones:"
    Write-Host "  1) Resolver y confirmar:"
    Write-Host "     git add <archivos>"
    Write-Host "     git commit -m `"Resuelve conflictos`""
    Write-Host "  2) Cancelar merge en curso:"
    Write-Host "     git merge --abort"
    exit 1
  }
}

docker compose ps

Write-Host "`n--- Últimos logs de postgres ---"
docker compose logs --tail=80 postgres
