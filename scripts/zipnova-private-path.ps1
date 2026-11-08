function Assert-ZipnovaPrivateRoot([string]$Root) {
  if (-not $Root -or -not [System.IO.Path]::IsPathRooted($Root) -or $Root.StartsWith('\\')) {
    throw 'La ubicación local de credenciales no es válida.'
  }
  $directory = Get-Item -LiteralPath $Root -Force -ErrorAction Stop
  if (-not $directory.PSIsContainer) { throw 'La ubicación local de credenciales no es válida.' }
  while ($directory) {
    if ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'La ubicación local no puede atravesar enlaces.' }
    $gitEntry = Join-Path $directory.FullName '.git'
    $bareHead = Join-Path $directory.FullName 'HEAD'
    $bareObjects = Join-Path $directory.FullName 'objects'
    $bareRefs = Join-Path $directory.FullName 'refs'
    if ((Test-Path -LiteralPath $gitEntry) -or ((Test-Path -LiteralPath $bareHead) -and (Test-Path -LiteralPath $bareObjects) -and (Test-Path -LiteralPath $bareRefs))) {
      throw 'La ubicación local no puede estar dentro de un repositorio Git.'
    }
    $directory = $directory.Parent
  }
}
