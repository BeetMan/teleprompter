param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$shortVersion = ($Version -split '\.')[0..1] -join '.'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  [System.IO.File]::WriteAllText($Path, $Content, $script:utf8NoBom)
}

function Set-JsonVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Version
  )

  $fullPath = Join-Path $root $Path
  if (-not (Test-Path -LiteralPath $fullPath)) {
    return
  }

  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath
  $pattern = '"version"\s*:\s*"\d+\.\d+\.\d+"'
  if ($content -notmatch $pattern) {
    throw "$Path does not contain a version field."
  }
  $content = [regex]::Replace($content, $pattern, "`"version`": `"$Version`"", 1)
  Write-Utf8NoBom -Path $fullPath -Content $content
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

  Write-Utf8NoBom -Path $fullPath -Content $content
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
  Write-Utf8NoBom -Path $fullPath -Content $content
}

Write-Utf8NoBom -Path (Join-Path $root 'VERSION') -Content "$Version`n"

Set-JsonVersion -Path 'package.json' -Version $Version
Set-PackageLockRootVersion -Path 'package-lock.json' -Version $Version
Set-JsonVersion -Path 'windows-tauri/package.json' -Version $Version
Set-PackageLockRootVersion -Path 'windows-tauri/package-lock.json' -Version $Version
Set-JsonVersion -Path 'windows-tauri/src-tauri/tauri.conf.json' -Version $Version
Set-PackageLockRootVersion -Path 'windows-electron/package-lock.json' -Version $Version
Set-JsonVersion -Path 'windows-electron/package.json' -Version $Version

Replace-InFile -Path 'windows-tauri/src-tauri/Cargo.toml' -Pattern 'version = "\d+\.\d+\.\d+"' -Replacement "version = `"$Version`""
Replace-InFile -Path 'windows-tauri/web/index.html' -Pattern 'app-version" content="\d+\.\d+"' -Replacement "app-version`" content=`"$shortVersion`""
Replace-InFile -Path 'windows-electron/index.html' -Pattern 'app-version" content="\d+\.\d+"' -Replacement "app-version`" content=`"$shortVersion`""

Write-Host "Synchronized desktop app version to $Version"
