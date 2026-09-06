param(
    [string]$OutputDir = "extra/files/proxybridge"
)

$ErrorActionPreference = "Stop"
$ProxyBridgeRepository = "https://github.com/InterceptSuite/ProxyBridge.git"
$ProxyBridgeCommit = "02703a0672a8b94011a4698368a392f7734c10dc"
$WinDivertUrl = "https://github.com/basil00/WinDivert/releases/download/v2.2.2/WinDivert-2.2.2-A.zip"
$WinDivertSha256 = "63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15"
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Destination = Join-Path $RepositoryRoot $OutputDir
$TempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$BuildRoot = Join-Path $TempRoot "kokorobox-proxybridge"
$SourceRoot = Join-Path $BuildRoot "source"
$ArchivePath = Join-Path $BuildRoot "windivert.zip"
$WinDivertRoot = Join-Path $BuildRoot "windivert/WinDivert-2.2.2-A"
$PatchPath = Join-Path $RepositoryRoot "build/proxybridge/fail-closed.patch"

if (Test-Path $BuildRoot) { Remove-Item $BuildRoot -Recurse -Force }
New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null

git clone --filter=blob:none --no-checkout $ProxyBridgeRepository $SourceRoot
if ($LASTEXITCODE -ne 0) { throw "ProxyBridge clone failed" }
git -C $SourceRoot checkout --detach $ProxyBridgeCommit
if ($LASTEXITCODE -ne 0) { throw "ProxyBridge checkout failed" }
git -C $SourceRoot apply --check --unidiff-zero $PatchPath
if ($LASTEXITCODE -ne 0) { throw "ProxyBridge fail-closed patch no longer applies" }
git -C $SourceRoot apply --unidiff-zero $PatchPath
if ($LASTEXITCODE -ne 0) { throw "ProxyBridge fail-closed patch failed" }

Invoke-WebRequest -Uri $WinDivertUrl -OutFile $ArchivePath
$DownloadedHash = (Get-FileHash -Algorithm SHA256 $ArchivePath).Hash.ToLowerInvariant()
if ($DownloadedHash -ne $WinDivertSha256) {
    throw "WinDivert SHA-256 mismatch: $DownloadedHash"
}
Expand-Archive -Path $ArchivePath -DestinationPath (Join-Path $BuildRoot "windivert") -Force

$VsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$VsPath = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $VsPath) { throw "Visual Studio C++ x64 tools are unavailable" }
$VcVars = Join-Path $VsPath "VC\Auxiliary\Build\vcvarsall.bat"
$WindowsRoot = Join-Path $SourceRoot "Windows"
$Sources = @(
    "src\ProxyBridge.c", "src\pb_util.c", "src\pb_process.c", "src\pb_rules.c",
    "src\pb_proxy.c", "src\pb_dns.c", "src\pb_socks5.c", "src\pb_http.c",
    "src\pb_conntrack.c", "src\pb_relay.c"
) -join " "
$CoreOutput = Join-Path $Destination "ProxyBridgeCore.dll"
$CliOutput = Join-Path $Destination "ProxyBridge_CLI.exe"

$CoreArgs = "/nologo /O2 /GL /Gy /W4 /wd4100 /wd4189 /wd4267 /wd4244 /wd4996 " +
    "/D_CRT_SECURE_NO_WARNINGS /D_WINSOCK_DEPRECATED_NO_WARNINGS /DPROXYBRIDGE_EXPORTS /DNDEBUG " +
    "/GS /guard:cf /I`"$WinDivertRoot\include`" $Sources /LD /link /LTCG /OPT:REF /OPT:ICF " +
    "/RELEASE /DYNAMICBASE /HIGHENTROPYVA /NXCOMPAT /guard:cf /LIBPATH:`"$WinDivertRoot\x64`" " +
    "WinDivert.lib ws2_32.lib iphlpapi.lib /OUT:`"$CoreOutput`""
$CoreCommand = "`"$VcVars`" x64 >nul && cd /d `"$WindowsRoot`" && cl.exe $CoreArgs"
cmd /c $CoreCommand
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $CoreOutput)) { throw "ProxyBridge core build failed" }

$CliArgs = "/nologo /O2 /GL /Gy /W4 /wd4100 /wd4189 /wd4267 /wd4244 /wd4996 " +
    "/D_WINSOCK_DEPRECATED_NO_WARNINGS /D_WIN32_WINNT=0x0601 /DNDEBUG /GS /guard:cf " +
    "cli\main.c /link /LTCG /OPT:REF /OPT:ICF /RELEASE /DYNAMICBASE /HIGHENTROPYVA /NXCOMPAT " +
    "/guard:cf /SUBSYSTEM:CONSOLE winhttp.lib shell32.lib advapi32.lib /OUT:`"$CliOutput`""
$CliCommand = "`"$VcVars`" x64 >nul && cd /d `"$WindowsRoot`" && cl.exe $CliArgs"
cmd /c $CliCommand
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $CliOutput)) { throw "ProxyBridge CLI build failed" }

& $CliOutput --version
if ($LASTEXITCODE -ne 0) { throw "ProxyBridge CLI smoke test failed" }

Copy-Item (Join-Path $WinDivertRoot "x64\WinDivert.dll") $Destination -Force
Copy-Item (Join-Path $WinDivertRoot "x64\WinDivert64.sys") $Destination -Force
Copy-Item (Join-Path $SourceRoot "LICENSE") (Join-Path $Destination "LICENSE.ProxyBridge.txt") -Force
Copy-Item (Join-Path $WinDivertRoot "LICENSE") (Join-Path $Destination "LICENSE.WinDivert.txt") -Force

Get-ChildItem $Destination | ForEach-Object { Write-Host "Staged $($_.Name)" }
