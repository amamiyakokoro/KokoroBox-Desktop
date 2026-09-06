param(
    [string]$OutputDir = "extra/files/process-router"
)

$ErrorActionPreference = "Stop"
$ProxyBridgeRepository = "https://github.com/amamiyakokoro/ProxyBridge.git"
$ProxyBridgeCommit = "4c2de905b12cf739f07453de3c0e8ce0361d198d"
$WinDivertUrl = "https://github.com/basil00/WinDivert/releases/download/v2.2.2/WinDivert-2.2.2-A.zip"
$WinDivertSha256 = "63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15"
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Destination = Join-Path $RepositoryRoot $OutputDir
$TempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$BuildRoot = Join-Path $TempRoot "kokorobox-proxybridge"
$SourceRoot = Join-Path $BuildRoot "source"
$ArchivePath = Join-Path $BuildRoot "windivert.zip"
$WinDivertRoot = Join-Path $BuildRoot "windivert/WinDivert-2.2.2-A"
$RouterSource = Join-Path $RepositoryRoot "build/proxybridge/kokorobox_process_router.c"

if (Test-Path $BuildRoot) { Remove-Item $BuildRoot -Recurse -Force }
New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null

git clone --filter=blob:none --no-checkout $ProxyBridgeRepository $SourceRoot
if ($LASTEXITCODE -ne 0) { throw "ProxyBridge clone failed" }
git -C $SourceRoot checkout --detach $ProxyBridgeCommit
if ($LASTEXITCODE -ne 0) { throw "ProxyBridge checkout failed" }

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
$CoreImportLibrary = Join-Path $BuildRoot "ProxyBridgeCore.lib"
$RouterOutput = Join-Path $Destination "kokorobox-process-router.exe"

$CoreArgs = "/nologo /O2 /GL /Gy /W4 /wd4100 /wd4189 /wd4267 /wd4244 /wd4996 " +
    "/D_CRT_SECURE_NO_WARNINGS /D_WINSOCK_DEPRECATED_NO_WARNINGS /DPROXYBRIDGE_EXPORTS /DNDEBUG " +
    "/GS /guard:cf /I`"$WinDivertRoot\include`" $Sources /LD /link /LTCG /OPT:REF /OPT:ICF " +
    "/RELEASE /DYNAMICBASE /HIGHENTROPYVA /NXCOMPAT /guard:cf /LIBPATH:`"$WinDivertRoot\x64`" " +
    "WinDivert.lib ws2_32.lib iphlpapi.lib /IMPLIB:`"$CoreImportLibrary`" /OUT:`"$CoreOutput`""
$CoreCommand = "`"$VcVars`" x64 >nul && cd /d `"$WindowsRoot`" && cl.exe $CoreArgs"
cmd /c $CoreCommand
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $CoreOutput)) { throw "ProxyBridge core build failed" }

$RouterArgs = "/nologo /O2 /GL /Gy /W4 /wd4100 /wd4189 /wd4267 /wd4244 /wd4996 " +
    "/D_WINSOCK_DEPRECATED_NO_WARNINGS /D_WIN32_WINNT=0x0601 /DNDEBUG /GS /guard:cf " +
    "/I`"$WindowsRoot\src`" `"$RouterSource`" `"$CoreImportLibrary`" /link /LTCG /OPT:REF /OPT:ICF " +
    "/RELEASE /DYNAMICBASE /HIGHENTROPYVA /NXCOMPAT /guard:cf /SUBSYSTEM:CONSOLE shell32.lib " +
    "/OUT:`"$RouterOutput`""
$RouterCommand = "`"$VcVars`" x64 >nul && cd /d `"$WindowsRoot`" && cl.exe $RouterArgs"
cmd /c $RouterCommand
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $RouterOutput)) { throw "KokoroBox process router build failed" }

Copy-Item (Join-Path $WinDivertRoot "x64\WinDivert.dll") $Destination -Force
Copy-Item (Join-Path $WinDivertRoot "x64\WinDivert64.sys") $Destination -Force
Copy-Item (Join-Path $SourceRoot "LICENSE") (Join-Path $Destination "LICENSE.ProxyBridge") -Force
Copy-Item (Join-Path $WinDivertRoot "LICENSE") (Join-Path $Destination "LICENSE.WinDivert") -Force

$DriverSignature = Get-AuthenticodeSignature (Join-Path $Destination "WinDivert64.sys")
if ($DriverSignature.Status -ne "Valid") {
    throw "The upstream WinDivert driver signature is not valid: $($DriverSignature.Status)"
}

$BinaryNames = @("kokorobox-process-router.exe", "ProxyBridgeCore.dll", "WinDivert.dll", "WinDivert64.sys")
$BinaryHashes = [ordered]@{}
foreach ($Name in $BinaryNames) {
    $BinaryHashes[$Name] = (Get-FileHash -Algorithm SHA256 (Join-Path $Destination $Name)).Hash.ToLowerInvariant()
}
$Manifest = [ordered]@{
    version = 1
    proxyBridgeRevision = $ProxyBridgeCommit
    winDivertVersion = "2.2.2"
    winDivertArchiveSha256 = $WinDivertSha256
    sha256 = $BinaryHashes
}
$Manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Destination "manifest.json") -Encoding utf8NoBOM

$Sbom = [ordered]@{
    bomFormat = "CycloneDX"
    specVersion = "1.6"
    version = 1
    metadata = [ordered]@{
        component = [ordered]@{ type = "application"; name = "KokoroBox Process Router" }
        properties = @(
            [ordered]@{ name = "kokorobox:proxybridge-revision"; value = $ProxyBridgeCommit },
            [ordered]@{ name = "kokorobox:windivert-archive-sha256"; value = $WinDivertSha256 }
        )
    }
    components = @(
        [ordered]@{
            type = "application"; name = "kokorobox-process-router"; version = $ProxyBridgeCommit
            licenses = @([ordered]@{ license = [ordered]@{ id = "MIT" } })
            hashes = @([ordered]@{ alg = "SHA-256"; content = $BinaryHashes["kokorobox-process-router.exe"] })
        },
        [ordered]@{
            type = "library"; name = "ProxyBridgeCore"; version = $ProxyBridgeCommit
            licenses = @([ordered]@{ license = [ordered]@{ id = "MIT" } })
            hashes = @([ordered]@{ alg = "SHA-256"; content = $BinaryHashes["ProxyBridgeCore.dll"] })
        },
        [ordered]@{
            type = "library"; name = "WinDivert DLL"; version = "2.2.2"
            licenses = @(
                [ordered]@{ license = [ordered]@{ id = "LGPL-3.0-only" } },
                [ordered]@{ license = [ordered]@{ id = "GPL-2.0-only" } }
            )
            hashes = @([ordered]@{ alg = "SHA-256"; content = $BinaryHashes["WinDivert.dll"] })
        },
        [ordered]@{
            type = "library"; name = "WinDivert Driver"; version = "2.2.2"
            licenses = @(
                [ordered]@{ license = [ordered]@{ id = "LGPL-3.0-only" } },
                [ordered]@{ license = [ordered]@{ id = "GPL-2.0-only" } }
            )
            hashes = @([ordered]@{ alg = "SHA-256"; content = $BinaryHashes["WinDivert64.sys"] })
        }
    )
}
$Sbom | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Destination "process-router-sbom.cdx.json") -Encoding utf8NoBOM

Get-ChildItem $Destination | ForEach-Object { Write-Host "Staged $($_.Name)" }
