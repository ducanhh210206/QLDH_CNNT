param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('primary', 'standby')]
    [string]$Backend,
    [switch]$ConfirmPrimaryFenced,
    [switch]$ConfirmStandbyWritable,
    [switch]$ConfirmFailbackVerified
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root 'gateway/.env'
$composePath = Join-Path $root 'docker/compose.gateway-windows.yml'
if (!(Test-Path $envPath)) { throw 'Create gateway/.env from gateway/.env.example first.' }
if ($Backend -eq 'standby' -and (!$ConfirmPrimaryFenced -or !$ConfirmStandbyWritable)) {
    throw 'Confirm Primary writes are fenced and Standby is approved for writes. Gateway does not promote MySQL.'
}
if ($Backend -eq 'primary' -and !$ConfirmFailbackVerified) {
    throw 'Confirm failback/data reconciliation and Standby write fencing before returning to Primary.'
}
$lines = @(Get-Content $envPath)
$port = '5000'
$primary = 'qldh-demo.onrender.com'
foreach ($line in $lines) {
    if ($line -match '^GATEWAY_STANDBY_PORT=(\d+)$') { $port = $Matches[1] }
    if ($line -match '^GATEWAY_PRIMARY_HOST=([A-Za-z0-9.-]+)$') { $primary = $Matches[1] }
}
$url = if ($Backend -eq 'standby') { "http://127.0.0.1:$port/health/ready" } else { "https://$primary/health/ready" }
$ready = Invoke-RestMethod -Uri $url -TimeoutSec 30
if ($ready.status -ne 'Healthy' -or $ready.instance -ne $Backend) {
    throw "Target backend is not Healthy with instance=$Backend. Routing was not changed."
}
$found = $false
$next = foreach ($line in $lines) {
    if ($line -match '^GATEWAY_ACTIVE_BACKEND=') { if (!$found) { "GATEWAY_ACTIVE_BACKEND=$Backend" }; $found = $true }
    else { $line }
}
if (!$found) { $next = @($next) + "GATEWAY_ACTIVE_BACKEND=$Backend" }
# UTF-8 without BOM works in Windows PowerShell 5 and PowerShell 7.
[IO.File]::WriteAllLines($envPath, [string[]]$next, (New-Object Text.UTF8Encoding($false)))
& docker compose --env-file $envPath -f $composePath config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration failed. The running Gateway was not changed.' }
& docker compose --env-file $envPath -f $composePath up -d --no-deps --force-recreate gateway
if ($LASTEXITCODE -ne 0) { throw 'Gateway update failed. Inspect docker compose ps/logs before retrying.' }
$verified = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try {
        $result = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health/ready' -TimeoutSec 5
        if ($result.status -eq 'Healthy' -and $result.instance -eq $Backend) { $verified = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (!$verified) { throw 'Gateway did not confirm the selected backend. Inspect logs; do not automatically switch back.' }
Write-Host "Gateway verified: $Backend is serving /health/ready. Database safety confirmations were supplied by the operator."
