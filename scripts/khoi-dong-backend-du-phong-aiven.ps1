[CmdletBinding()]
param(
    [string]$DatabaseUser = '',
    [string]$DatabaseHost = 'mysql-7b63f20-qldh-demo.b.aivencloud.com',
    [int]$DatabasePort = 14586,
    [string]$ExpectedDbUuid = 'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1',
    [string]$TestGatewayOrigin = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$caFile = Join-Path $root 'database/backups/aiven-ca.pem'
if (-not (Test-Path -LiteralPath $caFile -PathType Leaf)) { throw 'Khong tim thay chung chi CA Aiven.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Node.js.' }
if ($TestGatewayOrigin -and $TestGatewayOrigin -notmatch '^https://[a-z0-9-]+\.onrender\.com$') { throw 'Dia chi Gateway thu nghiem phai la origin HTTPS onrender.com.' }
if (-not $DatabaseUser) { $DatabaseUser = Read-Host 'Nhap ten tai khoan MySQL ung dung tren Aiven' }
if (-not $DatabaseUser) { throw 'Ten tai khoan MySQL khong duoc de trong.' }
$dbSecret = Read-Host 'Nhap mat khau MySQL ung dung tren Aiven' -AsSecureString
$jwtSecret = Read-Host 'Nhap JWT_SECRET giong backend chinh tren Render' -AsSecureString
try {
    $env:DB_HOST = $DatabaseHost
    $env:DB_PORT = [string]$DatabasePort
    $env:DB_NAME = 'order_management'
    $env:DB_USER = $DatabaseUser
    $env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $dbSecret).Password
    $env:DB_SSL = 'true'
    $env:DB_SSL_CA_FILE = $caFile
    $env:FAILOVER_EXPECTED_DB_UUID = $ExpectedDbUuid
    $env:JWT_SECRET = [System.Net.NetworkCredential]::new('', $jwtSecret).Password
    $env:INSTANCE_NAME = 'standby'
    $env:NODE_ENV = 'production'
    $env:HOST = '127.0.0.1'
    $env:PORT = '5000'
    $env:CORS_ORIGINS = 'http://127.0.0.1:8080,http://localhost:8080,https://qldh-demo.onrender.com'
    if ($TestGatewayOrigin) { $env:CORS_ORIGINS += ',' + $TestGatewayOrigin }
    $env:BACKUP_INTERVAL_HOURS = '0'
    if ($env:JWT_SECRET.Length -lt 32) { throw 'JWT_SECRET can it nhat 32 ky tu.' }
    if (-not $env:DB_PASSWORD) { throw 'Mat khau MySQL khong duoc de trong.' }
    Push-Location $root
    try { node backend/src/server.js } finally { Pop-Location }
}
finally {
    Remove-Item Env:DB_HOST, Env:DB_PORT, Env:DB_NAME, Env:DB_USER, Env:DB_PASSWORD, Env:DB_SSL, Env:DB_SSL_CA_FILE, Env:FAILOVER_EXPECTED_DB_UUID, Env:JWT_SECRET, Env:INSTANCE_NAME, Env:NODE_ENV, Env:HOST, Env:PORT, Env:CORS_ORIGINS, Env:BACKUP_INTERVAL_HOURS -ErrorAction SilentlyContinue
    $dbSecret.Dispose()
    $jwtSecret.Dispose()
}
