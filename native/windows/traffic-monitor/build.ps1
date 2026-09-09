param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("x64", "arm64", "ia32")]
    [string]$TargetArch,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir
)

$ErrorActionPreference = "Stop"
$ProjectDir = $PSScriptRoot
$BuildDir = Join-Path $ProjectDir "build-$TargetArch"
$CMakePlatform = switch ($TargetArch) {
    "x64" { "x64" }
    "arm64" { "ARM64EC" }
    "ia32" { "Win32" }
}

cmake -S $ProjectDir -B $BuildDir -A $CMakePlatform
if ($LASTEXITCODE -ne 0) { throw "TrafficMonitor plugin CMake configure failed" }

cmake --build $BuildDir --config Release --parallel
if ($LASTEXITCODE -ne 0) { throw "TrafficMonitor plugin build failed" }

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Copy-Item -Force (Join-Path $BuildDir "Release/KokoroBoxTrafficPlugin.dll") $OutputDir
