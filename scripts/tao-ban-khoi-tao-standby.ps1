[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SourceHost,
    [Parameter(Mandatory = $true)][ValidateRange(1, 65535)][int]$SourcePort,
    [Parameter(Mandatory = $true)][string]$SourceUser,
    [string]$Database = 'order_management',
    [string]$CAFile = '',
    [string]$BackupDirectory = ''
)

$ErrorActionPreference = 'Stop'
if ($Database -notmatch '^[A-Za-z0-9_]{1,64}$') { throw 'Invalid database name.' }
if (-not $BackupDirectory) { $BackupDirectory = Join-Path $PSScriptRoot '../database/backups' }
if (-not $CAFile) { $CAFile = Join-Path $BackupDirectory 'aiven-ca.pem' }
if (-not (Test-Path -LiteralPath $CAFile -PathType Leaf)) { throw 'CA file not found. Provide -CAFile with the correct Aiven CA certificate.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker was not found.' }

$started = [DateTimeOffset]::UtcNow
$id = $started.ToString('yyyyMMdd_HHmmss') + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$dir = Join-Path $BackupDirectory ('seed_' + $id)
New-Item -ItemType Directory -Path $dir -ErrorAction Stop | Out-Null
$dir = (Resolve-Path -LiteralPath $dir).Path
if ($dir.Contains(',')) { throw 'The backup path cannot contain a comma when passed to Docker --mount.' }
Copy-Item -LiteralPath $CAFile -Destination (Join-Path $dir 'source-ca.pem') -ErrorAction Stop
$partial = Join-Path $dir 'seed.sql.partial'
$sql = Join-Path $dir 'seed.sql'
$manifest = Join-Path $dir 'manifest.json'

$dockerArgs = @(
    'run', '--rm', '-it', '--mount', "type=bind,source=$dir,target=/seed",
    'mysql:8.4.13', 'mysqldump', '--no-defaults', '--protocol=TCP',
    "--host=$SourceHost", "--port=$SourcePort", "--user=$SourceUser", '--password',
    '--ssl-mode=VERIFY_IDENTITY', '--ssl-ca=/seed/source-ca.pem',
    '--default-character-set=utf8mb4', '--single-transaction', '--source-data=2',
    '--set-gtid-purged=COMMENTED', '--quick', '--no-tablespaces',
    '--routines', '--events', '--triggers', '--skip-add-drop-table', '--skip-add-locks',
    "--result-file=/seed/seed.sql.partial", '--databases', $Database
)

try {
    Write-Host 'MySQL will prompt for the Aiven password. Do not paste the password into chat.'
    & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE. Do not use the partial file." }
    if (-not (Test-Path -LiteralPath $partial -PathType Leaf) -or (Get-Item -LiteralPath $partial).Length -eq 0) {
        throw 'mysqldump did not create a non-empty file.'
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($partial)
    try { $checksum = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    $size = (Get-Item -LiteralPath $partial).Length
    Move-Item -LiteralPath $partial -Destination $sql
    $details = [ordered]@{
        database = $Database
        source_host = $SourceHost
        source_port = $SourcePort
        started_utc = $started.ToString('o')
        completed_utc = [DateTimeOffset]::UtcNow.ToString('o')
        sql_file = 'seed.sql'
        size_bytes = $size
        sha256 = $checksum
        gtid_setting = 'COMMENTED'
        source_coordinates = 'commented via --source-data=2'
        status = 'dump_created_not_imported_or_verified'
    }
    $details | ConvertTo-Json | Set-Content -LiteralPath $manifest -Encoding UTF8
    Write-Host "Created: $sql"
    Write-Host "Metadata: $manifest"
    Write-Host 'Do not import this file until GTID and replication scope have been reviewed.'
} finally {
    if (Test-Path -LiteralPath $partial -PathType Leaf) { Remove-Item -LiteralPath $partial -Force }
}
