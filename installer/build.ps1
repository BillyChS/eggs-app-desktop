<#
.SYNOPSIS
  Builds the Eggs App installer from a clean checkout: artifacts\installer\EggsApp-Setup-<version>.exe

.DESCRIPTION
  powershell -ExecutionPolicy Bypass -File installer\build.ps1

  Needs the .NET SDK from global.json, Node.js and pnpm (the publish builds the UI), and Inno Setup 6:
  winget install JRSoftware.InnoSetup
  The version comes from <Version> in Directory.Build.props, the only place it is set.
#>
[CmdletBinding()]
param(
    # Path to ISCC.exe, when Inno Setup is somewhere this script doesn't look.
    [string] $Iscc
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desktopProject = Join-Path $root 'src\EggsApp.Desktop\EggsApp.Desktop.csproj'
$publishDir = Join-Path $root 'src\EggsApp.Desktop\bin\publish\win-x64'
$outputDir = Join-Path $root 'artifacts\installer'

function Find-Iscc {
    if ($Iscc) {
        if (-not (Test-Path $Iscc)) { throw "ISCC.exe not found at $Iscc." }
        return $Iscc
    }

    $onPath = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }

    throw 'Inno Setup 6 was not found. Install it with: winget install JRSoftware.InnoSetup'
}

function Invoke-Checked([string] $what, [scriptblock] $command) {
    & $command
    if ($LASTEXITCODE -ne 0) { throw "$what failed with exit code $LASTEXITCODE." }
}

$isccPath = Find-Iscc

$version = (& dotnet msbuild $desktopProject -nologo -getProperty:Version).Trim()
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Could not read <Version> from Directory.Build.props (got '$version'). It must look like 1.2.3."
}
Write-Host "Eggs App $version" -ForegroundColor Cyan

# The profile empties the folder first (DeleteExistingFiles), so nothing from an older publish ends up installed.
Invoke-Checked 'dotnet publish' { dotnet publish $desktopProject -p:PublishProfile=win-x64 -nologo }

# A publish that succeeds without the UI would install an app that only shows an error.
$required = @('EggsApp.Desktop.exe', 'EggsApp.Api.dll', 'appsettings.json', 'e_sqlite3.dll', 'wwwroot\index.html')
foreach ($file in $required) {
    if (-not (Test-Path (Join-Path $publishDir $file))) { throw "The publish output is missing $file." }
}

# Removed by RemoveUnusedPublishFiles (EggsApp.Desktop.csproj) and PublishReferencesDocumentationFiles (win-x64.pubxml).
$unwanted = @('EggsApp.Api.exe', 'EggsApp.Api.runtimeconfig.json', 'appsettings.Development.json', '*.xml', '*.db')
foreach ($pattern in $unwanted) {
    $found = Get-ChildItem -Path $publishDir -Filter $pattern -Recurse -File
    if ($found) { throw "The publish output must not contain $($found[0].FullName)." }
}

Invoke-Checked 'Inno Setup' {
    & $isccPath /Qp "/DAppVersion=$version" "/DPublishDir=$publishDir" "/DOutputDir=$outputDir" (Join-Path $PSScriptRoot 'EggsApp.iss')
}

$installer = Join-Path $outputDir "EggsApp-Setup-$version.exe"
if (-not (Test-Path $installer)) { throw "Inno Setup did not produce $installer." }

$size = [math]::Round((Get-Item $installer).Length / 1MB, 1)
$hash = (Get-FileHash $installer -Algorithm SHA256).Hash
Write-Host ''
Write-Host "Installer: $installer ($size MB)" -ForegroundColor Green
Write-Host "SHA-256:   $hash"
