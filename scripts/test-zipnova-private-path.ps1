$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& git -C $repo check-ignore -q --no-index 'MaliDeco-Zipnova/zipnova.env'
if ($LASTEXITCODE -ne 1) { throw 'Expected the old path to be unignored.' }

$helper = Join-Path $PSScriptRoot 'zipnova-private-path.ps1'
. $helper
$blocked = $false
try { Assert-ZipnovaPrivateRoot -Root $repo } catch { $blocked = $true }
if (-not $blocked) { throw 'A Git working tree must not be accepted as private storage.' }

$setup = Join-Path $PSScriptRoot 'setup-zipnova-local.ps1'
$ErrorActionPreference = 'Continue'
$result = & powershell.exe -NoProfile -NonInteractive -File $setup -StorageRoot $repo 2>&1 | Out-String
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -eq 0 -or $result -notmatch 'no acepta argumentos') { throw 'Storage overrides must be rejected before prompting.' }
if (Test-Path -LiteralPath (Join-Path $repo 'MaliDeco-Zipnova\zipnova.env')) { throw 'Unexpected file inside Git working tree.' }
Write-Output 'Private path checks passed.'
