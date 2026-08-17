#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$DshRoot,
    [string]$PresetName = 'hard-flash',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($DshRoot)) {
    $userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
    $DshRoot = Join-Path -Path $userProfile -ChildPath '.dsh'
}

if ([string]::IsNullOrWhiteSpace($PresetName) -or $PresetName.Contains('\') -or $PresetName.Contains('/')) {
    throw 'PresetName must be a single non-empty directory name.'
}

$sourceRoot = $PSScriptRoot
$sourceFiles = @(
    'agent.cordis.yml',
    'preset.yml',
    'router-bootstrap.mjs'
)
$targetDirectory = Join-Path -Path (Join-Path -Path $DshRoot -ChildPath '.agent-presets') -ChildPath $PresetName

foreach ($file in $sourceFiles) {
    $sourcePath = Join-Path -Path $sourceRoot -ChildPath $file
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Missing source file: $sourcePath"
    }
}

Write-Host "Source:      $sourceRoot"
Write-Host "Destination: $targetDirectory"

if ($DryRun) {
    Write-Host 'Dry run: no files were created or copied.'
    exit 0
}

New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null

foreach ($file in $sourceFiles) {
    $sourcePath = Join-Path -Path $sourceRoot -ChildPath $file
    $targetPath = Join-Path -Path $targetDirectory -ChildPath $file
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

foreach ($file in $sourceFiles) {
    $sourcePath = Join-Path -Path $sourceRoot -ChildPath $file
    $targetPath = Join-Path -Path $targetDirectory -ChildPath $file
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
    if ($sourceHash -ne $targetHash) {
        throw "Copied file failed SHA-256 verification: $file"
    }
}

Write-Host ''
Write-Host 'hard-flash installed successfully.'
Write-Host "Managed files: $($sourceFiles.Count)"
Write-Host "Preset path:   $targetDirectory"
Write-Host ''
Write-Host 'If your dsh version uses the standard settings layout, set:'
Write-Host '  agent-presets:'
Write-Host "    default: $PresetName"
Write-Host ''
Write-Host 'Restart dsh after changing the active preset.'
