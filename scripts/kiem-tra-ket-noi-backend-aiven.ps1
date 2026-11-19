$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$caFile = Join-Path $root 'database/backups/aiven-ca.pem'
if (-not (Test-Path -LiteralPath $caFile -PathType Leaf)) { throw 'Khong tim thay chung chi CA Aiven.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Node.js.' }
$username = Read-Host 'Nhap ten tai khoan MySQL dang dung cho backend du phong'
if ([string]::IsNullOrWhiteSpace($username)) { throw 'Ten tai khoan khong duoc de trong.' }
$secret = Read-Host 'Nhap mat khau MySQL cua tai khoan nay' -AsSecureString
try {
    $env:OMDRS_DIAG_USER = $username.Trim()
    $env:OMDRS_DIAG_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
    $env:OMDRS_DIAG_CA = $caFile
    if (-not $env:OMDRS_DIAG_PASSWORD) { throw 'Mat khau khong duoc de trong.' }
    Push-Location $root
    try { node (Join-Path $PSScriptRoot 'kiem-tra-ket-noi-backend-aiven.cjs') } finally { Pop-Location }
} finally {
    Remove-Item Env:OMDRS_DIAG_USER, Env:OMDRS_DIAG_PASSWORD, Env:OMDRS_DIAG_CA -ErrorAction SilentlyContinue
    $secret.Dispose()
}
