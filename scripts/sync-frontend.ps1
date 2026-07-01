$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'windows-tauri/web/index.html'
$target = Join-Path $root 'windows-electron/index.html'

if (-not (Test-Path -LiteralPath $source)) {
  throw "Missing source frontend file: $source"
}

Copy-Item -LiteralPath $source -Destination $target -Force

Write-Host 'Synchronized frontend: windows-tauri/web/index.html -> windows-electron/index.html'
