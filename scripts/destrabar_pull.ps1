$ErrorActionPreference = 'Stop'

param(
  [ValidateSet('status', 'abort')]
  [string]$Modo = 'status'
)

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
  Write-Host "Este script debe correrse dentro de un repositorio git." -ForegroundColor Red
  exit 1
}

$unmergedFiles = git diff --name-only --diff-filter=U
$gitDir = git rev-parse --git-dir
$enRebase = (Test-Path (Join-Path $gitDir 'rebase-merge')) -or (Test-Path (Join-Path $gitDir 'rebase-apply'))

if (-not $unmergedFiles) {
  Write-Host "✅ No hay conflictos sin resolver. Ya podés hacer git pull." -ForegroundColor Green
  exit 0
}

if ($Modo -eq 'abort') {
  if ($enRebase) {
    Write-Host "⚠️ Se detectó un rebase en curso. Ejecutando: git rebase --abort" -ForegroundColor Yellow
    git rebase --abort
  }
  else {
    Write-Host "⚠️ Se detectó un merge sin resolver. Ejecutando: git merge --abort" -ForegroundColor Yellow
    git merge --abort
  }
  Write-Host "✅ Operación abortada. Ahora podés actualizar con:" -ForegroundColor Green
  Write-Host "   git pull --rebase"
  exit 0
}

Write-Host "❌ Tenés conflictos sin resolver. Por eso git pull falla." -ForegroundColor Red
if ($enRebase) {
  Write-Host "📌 Estado detectado: REBASE en curso (no merge normal)." -ForegroundColor Yellow
}
Write-Host ""
$unmergedFiles | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Opciones:"
Write-Host "  A) Resolver y confirmar:"
Write-Host "     git add <archivos>"
if ($enRebase) {
  Write-Host "     git rebase --continue"
}
else {
  Write-Host "     git commit -m `"Resuelve conflictos`""
}
Write-Host "  B) Cancelar merge actual:"
Write-Host "     .\scripts\destrabar_pull.ps1 abort"
exit 1
