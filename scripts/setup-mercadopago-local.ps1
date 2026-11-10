# Enter TEST credentials interactively. No secrets in arguments or console output.
$ErrorActionPreference = 'Stop'
if ($args.Count -gt 0) { throw 'Este asistente no acepta argumentos.' }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secretFile = Join-Path $projectRoot '.env.mercadopago.local'
$configFile = Join-Path $projectRoot '.env'
foreach ($path in @($secretFile, $configFile)) {
  if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'No se admiten enlaces en los archivos de configuración.' }
}
if (-not (Test-Path -LiteralPath $configFile)) { throw 'Primero configurá .env para desarrollo local.' }
$config = [IO.File]::ReadAllText($configFile)
if ($config -notmatch '(?m)^NODE_ENV=development\s*$' -or $config -notmatch '(?m)^DB_HOST=127\.0\.0\.1\s*$') { throw 'Este asistente requiere desarrollo local.' }
function Read-PrivateValue([string]$label) {
  $secure = Read-Host -Prompt $label -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}
$seller = Read-Host 'ID del VENDEDOR DE PRUEBA de Mercado Pago'
$token = Read-PrivateValue 'Access Token de ese vendedor de prueba (entrada oculta)'
$secret = Read-PrivateValue 'Firma secreta del panel Webhooks de esa aplicación (entrada oculta)'
try {
  if ($seller -notmatch '^[1-9][0-9]{0,15}$' -or $token -notmatch '^[A-Za-z0-9._~-]{8,512}$' -or $secret -notmatch '^[A-Za-z0-9._~-]{8,512}$') { throw 'Formato de credenciales inválido; no se guardó nada.' }
  if (-not (Test-Path -LiteralPath $secretFile)) { [IO.File]::WriteAllText($secretFile, '') }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
  Set-Acl -LiteralPath $secretFile -AclObject $acl
  [IO.File]::WriteAllText($secretFile, "MERCADOPAGO_TEST_ACCESS_TOKEN=$token`nMERCADOPAGO_WEBHOOK_SECRET=$secret`n", (New-Object Text.UTF8Encoding($false)))
  # Empty inline values would override the selected private file.
  $config = [regex]::Replace($config, '(?m)^MERCADOPAGO_(TEST_ACCESS_TOKEN|WEBHOOK_SECRET)=.*\r?\n?', '')
  $values = @{ MERCADOPAGO_TEST_ENABLED='true'; MERCADOPAGO_TEST_SELLER_ID=$seller; MERCADOPAGO_ENV_FILE='.env.mercadopago.local' }
  foreach ($key in $values.Keys) {
    $line = $key + '=' + $values[$key]
    if ($config -match "(?m)^$key=") { $config = [regex]::Replace($config, "(?m)^$key=.*$", $line) }
    else { $config = $config.TrimEnd() + "`n" + $line + "`n" }
  }
  [IO.File]::WriteAllText($configFile, $config, (New-Object Text.UTF8Encoding($false)))
  Write-Output 'Credenciales de prueba guardadas. Reiniciá npm run dev; el servidor verificará la identidad del vendedor antes de crear un pago.'
} finally { $token = $null; $secret = $null }
