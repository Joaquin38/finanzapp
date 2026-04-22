$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker no está instalado o no está en PATH.'
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Se creó .env desde .env.example'
}

Write-Host '[1/4] Levantando PostgreSQL...'
docker compose up -d

Write-Host '[2/4] Esperando healthcheck...'
for ($i = 0; $i -lt 30; $i++) {
  $estado = docker inspect --format='{{json .State.Health.Status}}' finanzas_postgres 2>$null
  if ($estado -match 'healthy') { break }
  Start-Sleep -Seconds 2
}

Write-Host '[3/4] Estado de servicios...'
docker compose ps

Write-Host '[4/4] Verificando DB...'
docker compose exec -T postgres pg_isready -U finanzas -d finanzas_db

Write-Host 'Entorno listo.'
Write-Host 'DBeaver => Host: localhost | Puerto: 5432 | DB: finanzas_db | User: finanzas'
