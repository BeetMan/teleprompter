$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Command
}

Invoke-Step 'Sync shared frontend' {
  & (Join-Path $root 'scripts/sync-frontend.ps1')
}

Invoke-Step 'Check versions' {
  & (Join-Path $root 'scripts/check-version.ps1')
}

Invoke-Step 'Check frontend parity' {
  & (Join-Path $root 'scripts/check-frontend-parity.ps1')
}

Invoke-Step 'Run Playwright smoke tests' {
  if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules/@playwright/test'))) {
    throw 'Missing Playwright dependency. Run `npm install` from the project root first.'
  }

  Push-Location $root
  try {
    npm test
    if ($LASTEXITCODE -ne 0) {
      throw "Playwright smoke tests failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host 'Project check passed.'
