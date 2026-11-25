$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$extDir = Join-Path $root 'extension'
$distDir = Join-Path $root 'dist'
$manifestPath = Join-Path $extDir 'manifest.json'

Write-Host "=== 1. Manifest V3 & Zero-Broad-Permission Security Audit ===" -ForegroundColor Cyan
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json

if ($manifest.manifest_version -ne 3) { throw "manifest_version must be 3" }
if ($manifest.name.Length -gt 75) { throw "manifest name exceeds 75 chars ($($manifest.name.Length))" }
if ($manifest.PSObject.Properties['host_permissions']) { throw "FORBIDDEN: host_permissions present in manifest.json!" }
if ($manifest.PSObject.Properties['optional_host_permissions']) { throw "FORBIDDEN: optional_host_permissions present in manifest.json!" }
if ($manifest.PSObject.Properties['content_scripts']) { throw "FORBIDDEN: persistent content_scripts present in manifest.json!" }

$allowedPerms = @('contextMenus', 'downloads', 'offscreen', 'storage', 'activeTab', 'scripting')
$forbiddenPerms = @('<all_urls>', 'http://*/*', 'https://*/*', 'tabs', 'webRequest', 'cookies', 'history', 'bookmarks')

foreach ($p in $manifest.permissions) {
    if ($forbiddenPerms -contains $p) { throw "FORBIDDEN permission found: $p" }
    if ($allowedPerms -notcontains $p) { throw "Unexpected permission found: $p" }
}
foreach ($req in $allowedPerms) {
    if ($manifest.permissions -notcontains $req) { throw "Missing required minimal permission: $req" }
}
Write-Host "[PASS] Strict minimal MV3 permissions verified: $($manifest.permissions -join ', ')" -ForegroundColor Green
Write-Host "[PASS] Zero host_permissions / zero <all_urls> / zero content_scripts verified." -ForegroundColor Green

Write-Host "`n=== 2. File Integrity, Icon Dimensions & Zero-Telemetry Audit ===" -ForegroundColor Cyan
$requiredFiles = @(
    'manifest.json', 'background.js', 'offscreen.html', 'offscreen.js',
    'popup.html', 'popup.js', 'batch.html', 'batch.js', 'style.css',
    'lib\core.js', 'lib\zip.js',
    'icons\icon16.png', 'icons\icon32.png', 'icons\icon48.png', 'icons\icon128.png'
)
foreach ($rel in $requiredFiles) {
    $full = Join-Path $extDir $rel
    if (-not (Test-Path $full)) { throw "Missing extension file: $rel" }
}
foreach ($s in @(16, 32, 48, 128)) {
    $img = [System.Drawing.Image]::FromFile((Join-Path $extDir "icons\icon$s.png"))
    if ($img.Width -ne $s -or $img.Height -ne $s) {
        $img.Dispose()
        throw "Icon icon$s.png has wrong dimensions: $($img.Width)x$($img.Height)"
    }
    $img.Dispose()
}

$jsFiles = Get-ChildItem -Path $extDir -Recurse -Filter '*.js'
foreach ($f in $jsFiles) {
    $txt = Get-Content -Raw -Encoding UTF8 $f.FullName
    if ($txt -match 'https?://(?!yefantao\.github\.io|\*)') {
        throw "Unexpected hardcoded external URL in $($f.Name)"
    }
    if ($txt -match 'google-analytics|gtag|mixpanel|posthog|sentry|amplitude') {
        throw "Forbidden analytics tracker reference in $($f.Name)"
    }
}
Write-Host "[PASS] All 15 extension files present, exact icon sizes verified (16/32/48/128), zero telemetry URLs." -ForegroundColor Green

Write-Host "`n=== 3. Real-Chrome HTML5 Canvas (WebP/AVIF/PNG/JPG/SVG), Resize & ZIP Unit Tests ===" -ForegroundColor Cyan
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chromePath)) {
    $chromePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
}
if (-not (Test-Path $chromePath)) { throw "Neither Chrome nor Edge found for headless verification." }

# Start HttpListener (supports concurrent HTTP/1.1 keep-alive & POST /__report cleanly)
$port = Get-Random -Minimum 39100 -Maximum 48900
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

$reportFile = Join-Path $env:TEMP ("cleansave-report-" + [Guid]::NewGuid().ToString('N').Substring(0,8) + ".json")
$userDataDir = Join-Path $env:TEMP ("cleansave-profile-" + [Guid]::NewGuid().ToString('N').Substring(0,8))

$serverJob = [PowerShell]::Create()
$serverJob.AddScript({
    param($listener, $root, $reportFile)
    $mimeMap = @{
        '.html' = 'text/html; charset=utf-8'
        '.js'   = 'application/javascript; charset=utf-8'
        '.css'  = 'text/css; charset=utf-8'
        '.png'  = 'image/png'
        '.json' = 'application/json; charset=utf-8'
    }
    while ($listener.IsListening) {
        try {
            $ctx = $listener.GetContext()
            $path = $ctx.Request.Url.AbsolutePath
            if ($path -eq '/__report' -and $ctx.Request.HttpMethod -eq 'POST') {
                $sr = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $sr.ReadToEnd()
                $sr.Close()
                [System.IO.File]::WriteAllText($reportFile, $body, (New-Object System.Text.UTF8Encoding($false)))
                $ok = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $ctx.Response.ContentType = 'application/json'
                $ctx.Response.ContentLength64 = $ok.Length
                $ctx.Response.OutputStream.Write($ok, 0, $ok.Length)
                $ctx.Response.OutputStream.Close()
                continue
            }

            $rel = [Uri]::UnescapeDataString($path).TrimStart('/').Replace('/', '\')
            if ([string]::IsNullOrEmpty($rel)) { $rel = 'landing\index.html' }
            $filePath = Join-Path $root $rel
            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $ctx.Response.ContentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $ctx.Response.StatusCode = 404
            }
            $ctx.Response.OutputStream.Close()
        } catch {
            break
        }
    }
}).AddArgument($listener).AddArgument($root).AddArgument($reportFile) | Out-Null
$asyncHandle = $serverJob.BeginInvoke()

$chromeProc = $null
try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $chromePath
    $psi.Arguments = "--headless=new --disable-gpu --no-first-run --disable-extensions --user-data-dir=`"$userDataDir`" `"${prefix}tests/test-runner.html`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $chromeProc = [System.Diagnostics.Process]::Start($psi)

    # Wait up to 20s for test-runner.html to POST its report
    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Test-Path $reportFile) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 150
    }
    if (-not (Test-Path $reportFile)) {
        throw "Timed out waiting for Chrome test-runner.html to submit results."
    }

    $report = Get-Content -Raw -Encoding UTF8 $reportFile | ConvertFrom-Json
    if ($report.PSObject.Properties['fatal']) {
        throw "Fatal browser JS error: $($report.fatal)"
    }

    foreach ($r in $report.results) {
        if ($r.status -eq 'PASS') {
            Write-Host "  [PASS] $($r.name) -- $($r.detail)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] $($r.name) -- $($r.error)" -ForegroundColor Red
        }
    }
    if ($report.summary.failed -gt 0) {
        throw "$($report.summary.failed) browser unit test(s) failed!"
    }
    Write-Host "[PASS] All $($report.summary.passed)/$($report.summary.total) real-Chrome Canvas & Engine tests passed!" -ForegroundColor Green

    Write-Host "`n=== 4. Cross-Verifying Pure-JS Generated ZIP with .NET ZipArchive ===" -ForegroundColor Cyan
    $zipBytes = [Convert]::FromBase64String($report.sampleZipBase64)
    $ms = New-Object System.IO.MemoryStream(,$zipBytes)
    $za = New-Object System.IO.Compression.ZipArchive($ms, [System.IO.Compression.ZipArchiveMode]::Read)
    $entryNames = @($za.Entries | ForEach-Object { "$($_.FullName) ($($_.Length)B)" })
    if ($za.Entries.Count -ne 3) { throw "Expected 3 entries in JS-generated ZIP, got $($za.Entries.Count)" }
    foreach ($entry in $za.Entries) {
        $es = $entry.Open()
        $buf = New-Object byte[] $entry.Length
        $read = $es.Read($buf, 0, $buf.Length)
        $es.Close()
        if ($read -ne $entry.Length) { throw "Corrupt ZIP entry: $($entry.FullName)" }
    }
    $za.Dispose(); $ms.Dispose()
    Write-Host "[PASS] .NET ZipArchive validated JS-built ZIP entries: $($entryNames -join ', ')" -ForegroundColor Green
} finally {
    if ($chromeProc -and -not $chromeProc.HasExited) { try { $chromeProc.Kill() } catch {} }
    $listener.Stop()
    $listener.Close()
    $serverJob.Dispose()
    if (Test-Path $reportFile) { Remove-Item -Force $reportFile -ErrorAction SilentlyContinue }
    if (Test-Path $userDataDir) { Remove-Item -Recurse -Force $userDataDir -ErrorAction SilentlyContinue }
}

Write-Host "`n=== 5. Packaging Chrome Web Store Upload Archive ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$zipPath = Join-Path $distDir "cleansave-image-v$($manifest.version).zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $files = Get-ChildItem -Path $extDir -Recurse -File | Sort-Object FullName
    foreach ($file in $files) {
        $rel = $file.FullName.Substring($extDir.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $rel,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
}

$verifyZip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$cwsEntries = @($verifyZip.Entries | ForEach-Object { $_.FullName })
$verifyZip.Dispose()
if ($cwsEntries -notcontains 'manifest.json') { throw "manifest.json not at root of CWS ZIP!" }

Write-Host "[PASS] Packaged $zipPath ($((Get-Item $zipPath).Length) bytes, $($cwsEntries.Count) files):" -ForegroundColor Green
$cwsEntries | ForEach-Object { Write-Host "       - $_" }