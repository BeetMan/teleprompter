$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$versionPath = Join-Path $root 'VERSION'

if (-not (Test-Path -LiteralPath $versionPath)) {
  throw 'VERSION file is missing.'
}

$expected = (Get-Content -Raw -Encoding UTF8 -LiteralPath $versionPath).Trim()
if ($expected -notmatch '^\d+\.\d+\.\d+$') {
  throw "VERSION must use x.y.z format. Current value: $expected"
}

$shortVersion = ($expected -split '\.')[0..1] -join '.'
$errors = New-Object System.Collections.Generic.List[string]

function Assert-JsonVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected
  )

  $fullPath = Join-Path $root $Path
  if (-not (Test-Path -LiteralPath $fullPath)) {
    $script:errors.Add("$Path is missing.")
    return
  }

  $actual = (Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath | ConvertFrom-Json).version
  if ($actual -ne $Expected) {
    $script:errors.Add("$Path version is $actual, expected $Expected.")
  }
}

function Assert-TextMatch {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Message
  )

  $fullPath = Join-Path $root $Path
  if (-not (Test-Path -LiteralPath $fullPath)) {
    $script:errors.Add("$Path is missing.")
    return
  }

  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath
  if ($content -notmatch $Pattern) {
    $script:errors.Add($Message)
  }
}

Assert-JsonVersion -Path 'windows-tauri/package.json' -Expected $expected
Assert-JsonVersion -Path 'windows-tauri/src-tauri/tauri.conf.json' -Expected $expected
Assert-JsonVersion -Path 'windows-electron/package.json' -Expected $expected

Assert-TextMatch -Path 'windows-tauri/src-tauri/Cargo.toml' -Pattern "version = `"$([regex]::Escape($expected))`"" -Message "windows-tauri/src-tauri/Cargo.toml version is not $expected."
Assert-TextMatch -Path 'windows-tauri/web/index.html' -Pattern "app-version`" content=`"$([regex]::Escape($shortVersion))`"" -Message "windows-tauri/web/index.html app-version is not $shortVersion."
Assert-TextMatch -Path 'windows-tauri/web/output.html' -Pattern "app-version`" content=`"$([regex]::Escape($shortVersion))`"" -Message "windows-tauri/web/output.html app-version is not $shortVersion."
Assert-TextMatch -Path 'windows-electron/index.html' -Pattern "app-version`" content=`"$([regex]::Escape($shortVersion))`"" -Message "windows-electron/index.html app-version is not $shortVersion."

if ($errors.Count -gt 0) {
  throw ($errors -join [Environment]::NewLine)
}

Write-Host "Version check passed: $expected"
