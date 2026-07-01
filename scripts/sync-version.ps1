param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$shortVersion = ($Version -split '\.')[0..1] -join '.'

function Set-JsonVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Version
  )

  $fullPath = Join-Path $root $Path
  if (-not (Test-Path -LiteralPath $fullPath)) {
    return
  }

  $json = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath | ConvertFrom-Json
  $json.version = $Version
  $json | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -LiteralPath $fullPath
}

function Set-PackageLockRootVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Version
  )

  $fullPath = Join-Path $root $Path
  if (-not (Test-Path -LiteralPath $fullPath)) {
    return
  }

  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath
  $matches = [regex]::Matches($content, '"version"\s*:\s*"\d+\.\d+\.\d+"')
  if ($matches.Count -lt 2) {
    throw "$Path does not contain expected root version fields."
  }

  for ($index = 1; $index -ge 0; $index--) {
    $match = $matches[$index]
    $replacement = "`"version`": `"$Version`""
    $content = $content.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)
  }

  Set-Content -Encoding UTF8 -LiteralPath $fullPath -Value $content
}

function Replace-InFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Replacement
  )

  $fullPath = Join-Path $root $Path
  if (-not (Test-Path -LiteralPath $fullPath)) {
    return
  }

  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath
  $content = $content -replace $Pattern, $Replacement
  Set-Content -Encoding UTF8 -LiteralPath $fullPath -Value $content
}

Set-Content -Encoding UTF8 -LiteralPath (Join-Path $root 'VERSION') -Value $Version

Set-JsonVersion -Path 'windows-tauri/package.json' -Version $Version
Set-PackageLockRootVersion -Path 'windows-tauri/package-lock.json' -Version $Version
Set-JsonVersion -Path 'windows-tauri/src-tauri/tauri.conf.json' -Version $Version
Set-PackageLockRootVersion -Path 'windows-electron/package-lock.json' -Version $Version
Set-JsonVersion -Path 'windows-electron/package.json' -Version $Version

Replace-InFile -Path 'windows-tauri/src-tauri/Cargo.toml' -Pattern 'version = "\d+\.\d+\.\d+"' -Replacement "version = `"$Version`""
Replace-InFile -Path 'windows-tauri/web/index.html' -Pattern 'app-version" content="\d+\.\d+"' -Replacement "app-version`" content=`"$shortVersion`""
Replace-InFile -Path 'windows-electron/index.html' -Pattern 'app-version" content="\d+\.\d+"' -Replacement "app-version`" content=`"$shortVersion`""

Write-Host "Synchronized desktop app version to $Version"
