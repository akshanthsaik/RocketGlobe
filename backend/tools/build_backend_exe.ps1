<#
.SYNOPSIS
Builds backend/dist/run_backend.exe via PyInstaller and copies it into
src-tauri/resources/backend/run_backend.exe, the path Tauri's build script
requires to exist (for both `tauri dev` and `tauri build`).

Requires backend/venv to already exist (see README's Backend setup).
#>

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRoot = (Resolve-Path (Join-Path $backendRoot "..")).Path
$venvPython = Join-Path $backendRoot "venv\Scripts\python.exe"
$venvPyInstaller = Join-Path $backendRoot "venv\Scripts\pyinstaller.exe"
$resourceDir = Join-Path $repoRoot "src-tauri\resources\backend"
$resourceExe = Join-Path $resourceDir "run_backend.exe"

if (-not (Test-Path $venvPython)) {
    throw "backend/venv not found. Create it first: cd backend; python -m venv venv; venv\Scripts\pip install -r requirements.txt"
}

if ((Test-Path $resourceExe) -and -not $Force) {
    Write-Host "run_backend.exe already exists at $resourceExe (use -Force to rebuild)." -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path $venvPyInstaller)) {
    Write-Step "Installing PyInstaller into backend/venv"
    & $venvPython -m pip install pyinstaller
}

Write-Step "Building run_backend.exe with PyInstaller"
Push-Location $backendRoot
& $venvPyInstaller run_backend.spec
Pop-Location

$builtExe = Join-Path $backendRoot "dist\run_backend.exe"
if (-not (Test-Path $builtExe)) {
    throw "PyInstaller did not produce $builtExe"
}

Write-Step "Copying to src-tauri/resources/backend/run_backend.exe"
New-Item -ItemType Directory -Force -Path $resourceDir | Out-Null
Copy-Item -Force $builtExe $resourceExe

Write-Host ""
Write-Host "Done: $resourceExe" -ForegroundColor Green
