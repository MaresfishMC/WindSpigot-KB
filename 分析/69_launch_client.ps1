# Launch the PCL fpsmaster (1.8.9 Forge) client offline and connect to localhost:25565.
# ASCII-ONLY on purpose: PowerShell reads .ps1 as GBK here, so non-ASCII literals corrupt paths.
param(
    [string]$Name = 'KBVictim',
    [int]$MemMB = 2048,
    [string]$Log = 'F:\open\client_fpsmaster.log',
    [string]$ServerHost = '127.0.0.1',
    [int]$ServerPort = 25565
)
$ErrorActionPreference = 'Continue'
$root = 'H:\pcl\.minecraft'
$verDir = Join-Path $root 'versions\fpsmaster'
$libRoot = Join-Path $root 'libraries'
$json = Get-Content (Join-Path $verDir 'fpsmaster.json') -Raw -Encoding UTF8 | ConvertFrom-Json

function Resolve-Lib([string]$coord) {
    $parts = $coord -split ':'
    if ($parts.Count -lt 3) { return $null }
    $grp = $parts[0] -replace '\.', '\'
    $art = $parts[1]; $ver = $parts[2]
    $cls = if ($parts.Count -ge 4) { $parts[3] } else { '' }
    # 1) exact expected path
    $exact = Join-Path $libRoot ("$grp\$art\$ver\$art-$ver" + $(if ($cls) { "-$cls" } else { '' }) + '.jar')
    if (Test-Path $exact) { return $exact }
    # 2) fallback: search whole libraries tree by file name pattern
    $pat = "$art-$ver*.jar"
    $hit = Get-ChildItem $libRoot -Recurse -Filter $pat -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
    return $null
}

$libs = @(); $missing = @()
foreach ($l in $json.libraries) {
    $p = $null
    if ($l.downloads -and $l.downloads.artifact -and $l.downloads.artifact.path) {
        $cand = Join-Path $libRoot ($l.downloads.artifact.path -replace '/', '\')
        if (Test-Path $cand) { $p = $cand }
    }
    if (-not $p) { $p = Resolve-Lib $l.name }
    if ($p) { $libs += $p } else { $missing += $l.name }
}
$libs += (Join-Path $verDir 'fpsmaster.jar')
$cp = ($libs -join ';')

$md5 = [System.Security.Cryptography.MD5]::Create()
$hash = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("OfflinePlayer:$Name"))
$hash[6] = ($hash[6] -band 0x0f) -bor 0x30
$hash[8] = ($hash[8] -band 0x3f) -bor 0x80
$uuid = ([guid]::new($hash)).ToString()

$natives = Join-Path $verDir 'fpsmaster-natives'
$argList = @(
    "-Xmx${MemMB}M",
    "-Djava.library.path=$natives",
    '-Dfml.ignoreInvalidMinecraftCertificates=true',
    '-Dfml.ignorePatchDiscrepancies=true',
    '-cp', $cp, $json.mainClass,
    '--username', $Name, '--version', 'fpsmaster',
    '--gameDir', $verDir,
    '--assetsDir', (Join-Path $root 'assets'),
    '--assetIndex', '1.8',
    '--uuid', $uuid, '--accessToken', '0', '--userProperties', '{}', '--userType', 'legacy',
    '--tweakClass', 'net.minecraftforge.fml.common.launcher.FMLTweaker',
    '--server', $ServerHost, '--port', "$ServerPort"
)
Write-Output "client=$Name uuid=$uuid libs=$($libs.Count) missing=$($missing.Count)"
if ($missing.Count) { Write-Output ("MISSING: " + ($missing -join ', ')) }
& java @argList 2>&1 | Tee-Object -FilePath $Log
