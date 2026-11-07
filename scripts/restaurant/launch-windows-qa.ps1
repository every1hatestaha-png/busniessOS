param(
  [Parameter(Mandatory = $true)][string]$StagingOrigin,
  [string]$ExecutablePath,
  [switch]$ValidateOnly
)
$ErrorActionPreference = "Stop"
$uri = $null
if (-not [uri]::TryCreate($StagingOrigin, [System.UriKind]::Absolute, [ref]$uri)) {
  throw "Invalid staging URL"
}
if ($uri.Scheme -ne "https" -or $uri.UserInfo -or $uri.AbsolutePath -ne "/" -or $uri.Query -or $uri.Fragment -or $uri.IsDefaultPort -eq $false) {
  throw "QA staging URL must be an HTTPS origin with no credentials, path, query, fragment or custom port"
}
$hostName = $uri.DnsSafeHost.ToLowerInvariant()
if ($hostName -in @("munshios.tech","www.munshios.tech","business-os-khzr.vercel.app") -or
    $hostName -eq "localhost" -or $hostName -eq "127.0.0.1" -or
    $hostName -notmatch '^[a-z0-9.-]+$') {
  throw "Refusing production, loopback or invalid QA origin"
}
$origin = $uri.GetLeftPart([System.UriPartial]::Authority)
if ($ValidateOnly) {
  Write-Output "QA origin syntax validated. Operator must independently confirm staging backend and test accounts."
  exit 0
}
if (-not $ExecutablePath) {
  $ExecutablePath = Join-Path $env:LOCALAPPDATA "Programs\MunshiOS Restaurant QA\MunshiOS Restaurant QA.exe"
}
if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
  throw "QA executable not found. Supply -ExecutablePath with the installed QA .exe path. No reinstall required."
}
$previous = [Environment]::GetEnvironmentVariable("BUSINESSOS_APP_ORIGIN", "Process")
try {
  [Environment]::SetEnvironmentVariable("BUSINESSOS_APP_ORIGIN", $origin, "Process")
  Start-Process -FilePath $ExecutablePath | Out-Null
} finally {
  [Environment]::SetEnvironmentVariable("BUSINESSOS_APP_ORIGIN", $previous, "Process")
}
Write-Output "QA process launched with explicit origin. Verify login and tenant isolation manually."
