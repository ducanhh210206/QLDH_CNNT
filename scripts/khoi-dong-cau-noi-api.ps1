$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bridgeSecret = Read-Host 'Nhap ma cau noi API (64 ky tu hex)' -AsSecureString
try {
    $env:STANDBY_BRIDGE_TOKEN = [System.Net.NetworkCredential]::new('', $bridgeSecret).Password
    if ($env:STANDBY_BRIDGE_TOKEN -notmatch '^[a-fA-F0-9]{64}$') { throw 'Ma cau noi phai co 64 ky tu hex.' }
    Push-Location $root
    try { node gateway/standby-api-bridge.mjs } finally { Pop-Location }
} finally {
    Remove-Item Env:STANDBY_BRIDGE_TOKEN -ErrorAction SilentlyContinue
    $bridgeSecret.Dispose()
}
