<#
.SYNOPSIS
  Build and run MediaGen on Windows (no WSL required).

.DESCRIPTION
  Checks prerequisites, installs deps with pnpm, builds, and serves the app.
  Mirrors what `docker compose up` does, but natively on Windows.

.PARAMETER Dev
  Run the dev servers (backend tsx-watch + frontend Vite) in separate windows
  instead of building and serving the production bundle.

.PARAMETER SkipInstall
  Skip `pnpm install` (use when deps are already up to date).

.PARAMETER SkipBuild
  Skip the production build (serve an existing dist/).

.EXAMPLE
  .\start.ps1            # install, build, serve on http://localhost:3000
.EXAMPLE
  .\start.ps1 -Dev       # backend on :3000, Vite on :5173
#>
[CmdletBinding()]
param(
  [switch]$Dev,
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Test-OnPath([string]$name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# --- Prerequisites -----------------------------------------------------------
if (-not (Test-OnPath 'node')) { throw "Node.js (>=22) is required but was not found on PATH." }

# pnpm comes from the pinned packageManager field via corepack.
if (-not (Test-OnPath 'pnpm')) {
  Write-Host "pnpm not found; enabling it via corepack..." -ForegroundColor Yellow
  corepack enable
  corepack prepare --activate
}

# Required external CLIs (the app shells out to these). Warn but don't block —
# you may only be using part of the app.
$required = @{ ffmpeg = 'film assembly'; ffprobe = 'film assembly'; nickel = 'reading .ncl project files' }
$optional = @{ python = 'comics page montage / book export'; codex = 'AI frame generation for comics' }
foreach ($t in $required.Keys) {
  if (-not (Test-OnPath $t)) { Write-Host "WARNING: '$t' not on PATH — needed for $($required[$t])." -ForegroundColor Yellow }
}
foreach ($t in $optional.Keys) {
  if (-not (Test-OnPath $t)) { Write-Host "note: optional '$t' not on PATH — $($optional[$t]) will be unavailable." -ForegroundColor DarkGray }
}

# --- Install -----------------------------------------------------------------
if (-not $SkipInstall) {
  Write-Host "`nInstalling dependencies (pnpm)..." -ForegroundColor Cyan
  if (Test-Path "$PSScriptRoot\pnpm-lock.yaml") { pnpm install --frozen-lockfile } else { pnpm install }
}

# --- Run ---------------------------------------------------------------------
if ($Dev) {
  Write-Host "`nStarting dev servers in new windows..." -ForegroundColor Cyan
  Start-Process pwsh -ArgumentList '-NoExit', '-Command', "Set-Location '$PSScriptRoot'; pnpm dev:backend"
  Start-Process pwsh -ArgumentList '-NoExit', '-Command', "Set-Location '$PSScriptRoot'; pnpm dev:frontend"
  Write-Host "Backend: http://localhost:3000   Frontend (Vite): http://localhost:5173" -ForegroundColor Green
  return
}

if (-not $SkipBuild) {
  Write-Host "`nBuilding..." -ForegroundColor Cyan
  pnpm build
}

if (-not $env:DATA_DIR) { $env:DATA_DIR = Join-Path $PSScriptRoot 'data' }
Write-Host "`nServing on http://localhost:$($env:PORT ?? 3000)  (data: $env:DATA_DIR)" -ForegroundColor Green
node dist/server.js
