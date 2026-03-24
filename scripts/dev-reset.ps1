# Resets JOBY dev stack (safe-by-default)
# 1) cleans ports (recognized processes only)
# 2) starts npm run dev:full

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$cleanScript = Join-Path $scriptDir 'dev-ports-clean.ps1'

Write-Host "== JOBY dev reset ==" -ForegroundColor Cyan

try {
  Write-Host "`n[1/2] Cleaning ports..." -ForegroundColor Cyan
  & $cleanScript
} catch {
  Write-Host "`nERROR: Port cleanup failed. Not starting dev:full." -ForegroundColor Red
  throw
}

Write-Host "`n[2/2] Starting full stack (npm run dev:full)..." -ForegroundColor Cyan
Set-Location $repoRoot

# Keep attached so processes run normally in the same terminal
& npm run dev:full
