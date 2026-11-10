# Run interactively on the owner's Windows account. Never pass credentials as arguments.
$ErrorActionPreference = 'Stop'
if ($args.Count -gt 0) { throw 'Este asistente no acepta argumentos.' }
. (Join-Path $PSScriptRoot 'zipnova-private-path.ps1')
$localRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
Assert-ZipnovaPrivateRoot -Root $localRoot
$folder = Join-Path $localRoot 'MaliDeco-Zipnova'
$file = Join-Path $folder 'zipnova.env'
if ([System.IO.Directory]::Exists($folder)) { throw 'La carpeta local ya existe; no se modificó ningún archivo.' }

function Read-PrivateValue([string]$label) {
  $secure = Read-Host -Prompt $label -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}

$token = Read-PrivateValue 'API token de Zipnova (entrada oculta)'
$secret = Read-PrivateValue 'API secret de Zipnova (entrada oculta)'
if ($token -notmatch '^[A-Za-z0-9._~-]{1,512}$' -or $secret -notmatch '^[A-Za-z0-9._~-]{1,512}$') {
  throw 'El formato no puede guardarse con este asistente; no se creó ningún archivo.'
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
try {
  $directory = New-Item -ItemType Directory -Path $folder
  Set-Acl -LiteralPath $directory.FullName -AclObject $acl
  $stream = [System.IO.File]::Open($file, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
    try { $writer.Write("ZIPNOVA_API_TOKEN=$token`nZIPNOVA_API_SECRET=$secret`nZIPNOVA_ENABLED=false`n") }
    finally { $writer.Dispose() }
  } finally { $stream.Dispose() }
  Write-Output "Credenciales guardadas localmente en $file. La conexión sigue desactivada."
} finally { $token = $null; $secret = $null }
