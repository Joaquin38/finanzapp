$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '[1/3] Deteniendo servicios...'
docker compose down

Write-Host '[2/3] Eliminando volumen postgres_data...'
docker volume rm finanzas-app_postgres_data | Out-Null

Write-Host '[3/3] Iniciando PostgreSQL limpio...'
docker compose up -d

Write-Host 'Base reiniciada.'
