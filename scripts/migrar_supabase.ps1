param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseConnectionString,

  [switch]$Yes,
  [switch]$SkipSchema,
  [switch]$SkipData
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker no esta disponible. Levanta Docker Desktop e intenta de nuevo."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backupDir = Join-Path $repoRoot "backups"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$schemaDump = Join-Path $backupDir "schema_local_$stamp.sql"
$dataDump = Join-Path $backupDir "datos_locales_$stamp.sql"

Write-Host "1/5 Verificando PostgreSQL local..."
docker compose exec -T postgres pg_isready -U finanzas -d finanzas_db | Out-Host

Write-Host "2/5 Exportando estructura local a $schemaDump"
docker compose exec -T postgres pg_dump -U finanzas -d finanzas_db --schema-only --no-owner --no-acl | Set-Content -Path $schemaDump -Encoding UTF8

Write-Host "3/5 Exportando datos locales a $dataDump"
docker compose exec -T postgres pg_dump -U finanzas -d finanzas_db --data-only --inserts --no-owner --no-acl | Set-Content -Path $dataDump -Encoding UTF8

if (-not $Yes) {
  Write-Host ""
  Write-Host "Se crearon backups locales. Nada fue borrado."
  Write-Host "Destino Supabase:"
  Write-Host $SupabaseConnectionString
  $confirmation = Read-Host "Escribi MIGRAR para importar en Supabase"
  if ($confirmation -ne "MIGRAR") {
    Write-Host "Cancelado. Tus backups quedaron en $backupDir"
    exit 0
  }
}

if (-not $SkipSchema) {
  Write-Host "4/5 Importando estructura en Supabase..."
  Get-Content -Path $schemaDump -Raw | docker compose exec -T postgres psql $SupabaseConnectionString -v ON_ERROR_STOP=1
} else {
  Write-Host "4/5 Estructura omitida por parametro."
}

if (-not $SkipData) {
  Write-Host "5/5 Importando datos en Supabase..."
  Get-Content -Path $dataDump -Raw | docker compose exec -T postgres psql $SupabaseConnectionString -v ON_ERROR_STOP=1
} else {
  Write-Host "5/5 Datos omitidos por parametro."
}

Write-Host ""
Write-Host "Migracion terminada."
Write-Host "Backups locales:"
Write-Host "- $schemaDump"
Write-Host "- $dataDump"
