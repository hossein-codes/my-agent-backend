# Local development setup for Windows / PowerShell.
#
#   npm run infra:setup:win
#
# Equivalent of scripts/devbox.sh. Idempotent: safe to re-run.
# Never overwrites an existing .env.development.

$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Host '==> Checking prerequisites'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'docker is required but not on PATH. Install Docker Desktop for Windows.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'node is required but not on PATH.'
}

# Docker Desktop on Windows needs its engine actually running, not just installed.
try { docker info 2>&1 | Out-Null } catch { }
if ($LASTEXITCODE -ne 0) {
  Fail @'
The Docker engine is not responding.

  * Start Docker Desktop and wait until the whale icon says "Engine running".
  * If Docker Desktop reports a WSL problem, open PowerShell AS ADMINISTRATOR
    and run:  wsl --update      (then reboot and start Docker Desktop again)
'@
}

Write-Host '==> Starting Postgres and Redis'
docker compose up -d
if ($LASTEXITCODE -ne 0) { Fail 'docker compose failed to start the containers.' }

Write-Host '==> Waiting for Postgres to accept connections'
$ready = $false
foreach ($i in 1..30) {
  docker compose exec -T postgres pg_isready -U fashion -d fashion_dev 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; Write-Host '    Postgres is ready'; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail 'Postgres did not become ready in time. Check: docker compose logs postgres' }

if (-not (Test-Path '.env.development')) {
  Write-Host '==> Creating .env.development from .env.example'
  Copy-Item '.env.example' '.env.development'

  # Generate real secrets instead of leaving the change-me placeholders.
  $keys = @(
    'JWT_ACCESS_SECRET',
    'OTP_HASH_PEPPER',
    'AUDIT_HASH_KEY',
    'DATA_ENCRYPTION_KEY',
    'ADMIN_BOOTSTRAP_SECRET'
  )
  # Read as UTF-8 without BOM; a BOM on line 1 would corrupt the first key.
  $content = [System.IO.File]::ReadAllText('.env.development')
  foreach ($key in $keys) {
    $bytes = New-Object 'System.Byte[]' 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $content = [System.Text.RegularExpressions.Regex]::Replace(
      $content, "(?m)^$key=.*$", "$key=$secret")
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText('.env.development', $content, $utf8NoBom)

  Write-Host '    generated fresh secrets for JWT/OTP/AUDIT/ENCRYPTION/BOOTSTRAP'
} else {
  Write-Host '==> .env.development already exists - leaving it untouched'
}

Write-Host '==> Installing dependencies'
npm install
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed.' }

Write-Host '==> Generating the Prisma client'
npm run prisma:generate
if ($LASTEXITCODE -ne 0) { Fail 'prisma generate failed.' }

Write-Host ''
Write-Host 'Setup complete. Next:' -ForegroundColor Green
Write-Host '  npm run prisma:migrate:dev   # create/apply migrations (none exist yet)'
Write-Host '  npm run seed                 # load RBAC + reference catalog data'
Write-Host '  npm run start:dev            # start the API on :3000 (docs at /docs)'
