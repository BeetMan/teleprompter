$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$tauriIndex = Join-Path $root 'windows-tauri/web/index.html'
$electronIndex = Join-Path $root 'windows-electron/index.html'

foreach ($path in @($tauriIndex, $electronIndex)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing frontend file: $path"
  }
}

$tauriHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $tauriIndex).Hash
$electronHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $electronIndex).Hash

if ($tauriHash -ne $electronHash) {
  throw "Frontend drift detected. windows-tauri/web/index.html and windows-electron/index.html must stay identical."
}

Write-Host "Frontend parity check passed: $tauriHash"
