param(
    [string]$DatabaseUrl = "",
    [string]$CesiumToken = "",
    [switch]$SkipTypeCheck,
    [switch]$SkipBackendMigrate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found in PATH: $Name"
    }
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Resolve-PostgresHome {
    if (-not [string]::IsNullOrWhiteSpace($env:POSTGRES_HOME)) {
        $candidate = $env:POSTGRES_HOME
        if (Test-Path (Join-Path $candidate "bin\postgres.exe")) {
            return $candidate
        }
    }

    $base = "C:\Program Files\PostgreSQL"
    if (-not (Test-Path $base)) {
        return $null
    }

    $dirs = Get-ChildItem $base -Directory | Sort-Object {
        try { [version]$_.Name } catch { [version]"0.0" }
    } -Descending

    foreach ($dir in $dirs) {
        $candidate = $dir.FullName
        if (Test-Path (Join-Path $candidate "bin\postgres.exe")) {
            return $candidate
        }
    }

    return $null
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendRoot = Join-Path $repoRoot "backend"
$venvPython = Join-Path $backendRoot "venv\Scripts\python.exe"
$backendEnvPath = Join-Path $backendRoot ".env"
$frontendEnvPath = Join-Path $repoRoot ".env"
$postgresResourceRoot = Join-Path $repoRoot "src-tauri\resources\postgres"

Require-Command "python"
Require-Command "bun"
Require-Command "cargo"

Write-Step "Staging PostgreSQL runtime resources for Tauri bundle"

$postgresHome = Resolve-PostgresHome
if (-not $postgresHome) {
    throw "Could not locate PostgreSQL installation. Set POSTGRES_HOME (e.g. C:\Program Files\PostgreSQL\18)."
}

Write-Host "Using PostgreSQL at: $postgresHome" -ForegroundColor DarkGray
New-Item -ItemType Directory -Force -Path $postgresResourceRoot | Out-Null

foreach ($dirName in @("bin", "lib", "share")) {
    $src = Join-Path $postgresHome $dirName
    $dst = Join-Path $postgresResourceRoot $dirName

    if (-not (Test-Path $src)) {
        throw "Missing PostgreSQL runtime directory: $src"
    }

    if (Test-Path $dst) {
        Remove-Item -Recurse -Force $dst
    }

    Copy-Item -Path $src -Destination $dst -Recurse -Force
}

if (-not (Test-Path (Join-Path $postgresResourceRoot "share\postgres.bki"))) {
    throw "PostgreSQL share files are incomplete. Missing share\\postgres.bki in $postgresResourceRoot"
}

Write-Step "Writing backend env file"

$backendEnvContent = @"
LL2_BASE_URL=https://ll.thespacedevs.com/2.3.0
LL2_MIN_REQUEST_INTERVAL=2.0
LL2_BASE_BACKOFF=1.0
LL2_MAX_BACKOFF=60.0
LL2_MAX_RETRIES=8
LL2_MAX_WAIT_SECONDS=120
LL2_MAX_REQUEST_DURATION=300
LL2_SYNC_PAGE_LIMIT=500
LL2_LAUNCHES_MIN_REQUEST_INTERVAL=2.5
LL2_LAUNCHES_MAX_RETRIES=20
LL2_LAUNCHES_MAX_WAIT_SECONDS=300
LL2_LAUNCHES_MAX_REQUEST_DURATION=1800
LL2_STATIC_RESOURCES_MIN_INTERVAL=86400
LL2_EXISTING_DATA_LOOKBACK_HOURS=24
LL2_ALLOW_PARTIAL_SYNC_ON_RATE_LIMIT=true
API_HOST=127.0.0.1
API_PORT=8000
"@

if (-not [string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    $backendEnvContent = "DATABASE_URL=$DatabaseUrl`n" + $backendEnvContent
}

$backendEnvContent | Set-Content -Encoding UTF8 $backendEnvPath

Write-Step "Writing frontend env file"
@"
VITE_CESIUM_ION_ACCESS_TOKEN=$CesiumToken
VITE_API_BASE_URL=http://127.0.0.1:8000/api
"@ | Set-Content -Encoding UTF8 $frontendEnvPath

if (-not (Test-Path $venvPython)) {
    Write-Step "Creating backend virtualenv"
    Push-Location $backendRoot
    python -m venv venv
    Pop-Location
}

Write-Step "Installing backend dependencies"
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $backendRoot "requirements.txt")

if (-not $SkipBackendMigrate) {
    Write-Step "Initializing backend schema"
    Push-Location $backendRoot
    & $venvPython -c "from app.database import init_db; init_db()"
    Pop-Location
}

Write-Step "Installing frontend dependencies"
Push-Location $repoRoot
bun install --frozen-lockfile

if (-not $SkipTypeCheck) {
    Write-Step "Running TypeScript checks"
    bun run check
}

Write-Step "Building Tauri bundle"
bun run tauri build
Pop-Location

$bundleDir = Join-Path $repoRoot "src-tauri\target\release\bundle"
Write-Step "Build complete"
Write-Host "Artifacts: $bundleDir" -ForegroundColor Green
