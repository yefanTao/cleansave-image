param(
    [int]$Count = 500,
    [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'private')
)
$ErrorActionPreference = 'Stop'
if (-not ('CleanSaveKeyGen' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'CleanSaveKeyGen.cs')
}
$selfTest = [CleanSaveKeyGen]::GenerateFromPayload('K9M2V7QX')
if ($selfTest -ne 'CSPRO-K9M2-V7QX-A7ND') {
    throw "Algorithm parity check FAILED! Expected CSPRO-K9M2-V7QX-A7ND, got $selfTest"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$keys = [CleanSaveKeyGen]::GenerateBatch($Count)
$txtPath = Join-Path $OutDir "pro-keys-$Count.txt"
$csvPath = Join-Path $OutDir "pro-keys-$Count.csv"
[System.IO.File]::WriteAllLines($txtPath, $keys, (New-Object System.Text.UTF8Encoding($false)))

$csvLines = New-Object 'System.Collections.Generic.List[string]'
$csvLines.Add('index,license_key,status')
for ($i = 0; $i -lt $keys.Count; $i++) {
    $csvLines.Add("$($i + 1),$($keys[$i]),unused")
}
[System.IO.File]::WriteAllLines($csvPath, $csvLines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "[PASS] JS parity verified ($selfTest)" -ForegroundColor Green
Write-Host "[PASS] Generated $Count unique offline-verifiable Pro keys:" -ForegroundColor Green
Write-Host "       - $txtPath"
Write-Host "       - $csvPath"
Write-Host "       Sample keys: $($keys[0]), $($keys[1]), $($keys[2])"