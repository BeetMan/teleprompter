$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$tauriIndex = Join-Path $root 'windows-tauri/web/index.html'
$electronIndex = Join-Path $root 'windows-electron/index.html'

foreach ($path in @($tauriIndex, $electronIndex)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing frontend file: $path"
  }
}

function Get-Sha256Hex([string] $path) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($path)
    try {
      return (($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString('X2') }) -join '')
    } finally {
      $stream.Dispose()
    }
  } finally {
    $sha256.Dispose()
  }
}

$tauriHash = Get-Sha256Hex $tauriIndex
$electronHash = Get-Sha256Hex $electronIndex

if ($tauriHash -ne $electronHash) {
  throw "Frontend drift detected. windows-tauri/web/index.html and windows-electron/index.html must stay identical."
}

Write-Host "Frontend parity check passed: $tauriHash"
