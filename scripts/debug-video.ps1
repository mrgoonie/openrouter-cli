# Debug OpenRouter video API end-to-end with curl to isolate CLI from server behavior.
# Run from repo root:  powershell -File scripts/debug-video.ps1

$ErrorActionPreference = 'Stop'

# Load .env from repo root if env var not set
if (-not $env:OPENROUTER_API_KEY -and (Test-Path '.env')) {
  Get-Content '.env' | ForEach-Object {
    if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
      $name = $matches[1]
      $val = $matches[2].Trim('"').Trim("'")
      if (-not (Get-Item "env:$name" -ErrorAction SilentlyContinue)) {
        Set-Item "env:$name" $val
      }
    }
  }
}

if (-not $env:OPENROUTER_API_KEY) {
  Write-Host "Set `$env:OPENROUTER_API_KEY first or add to .env" -ForegroundColor Red
  exit 1
}

$base = 'https://openrouter.ai/api/v1'
$body = @{
  model         = 'bytedance/seedance-1-5-pro'
  prompt        = 'a cat in a suit eating spaghetti'
  aspect_ratio  = '1:1'
  duration      = 6
} | ConvertTo-Json -Compress

$bodyFile = Join-Path $env:TEMP "or-video-body.json"
[System.IO.File]::WriteAllText($bodyFile, $body, [System.Text.UTF8Encoding]::new($false))

Write-Host "=== 1. POST $base/videos ===" -ForegroundColor Cyan
Write-Host "Body: $body" -ForegroundColor DarkGray
$createRaw = curl.exe -sS -i -X POST "$base/videos" `
  -H "Authorization: Bearer $env:OPENROUTER_API_KEY" `
  -H 'Content-Type: application/json' `
  --data-binary "@$bodyFile"
$createRaw | Write-Host
Write-Host ""

# Split headers from body (blank line separator)
$split = ($createRaw -join "`n") -split "`r?`n`r?`n", 2
$createBody = if ($split.Count -ge 2) { $split[1] } else { $createRaw }

try {
  $job = $createBody | ConvertFrom-Json
} catch {
  Write-Host "Failed to parse create response" -ForegroundColor Red
  exit 1
}

$jobId = $job.id
$pollingUrl = $job.polling_url
Write-Host "Job ID: $jobId" -ForegroundColor Yellow
Write-Host "Polling URL from server: $pollingUrl" -ForegroundColor Yellow
Write-Host ""

Start-Sleep -Seconds 5

Write-Host "=== 2. GET $base/videos/$jobId (doc-suggested path) ===" -ForegroundColor Cyan
curl.exe -sS -i "$base/videos/$jobId" `
  -H "Authorization: Bearer $env:OPENROUTER_API_KEY" | Write-Host
Write-Host ""

if ($pollingUrl -and $pollingUrl -ne "$base/videos/$jobId") {
  Write-Host "=== 3. GET $pollingUrl (server-provided URL) ===" -ForegroundColor Cyan
  curl.exe -sS -i $pollingUrl `
    -H "Authorization: Bearer $env:OPENROUTER_API_KEY" | Write-Host
  Write-Host ""
}

Write-Host "=== 4. Try alt paths (print status + first 200 chars of body) ===" -ForegroundColor Cyan
$alts = @(
  "$base/videos/$jobId/status",
  "$base/videos/$jobId/result",
  "$base/videos/status/$jobId",
  "$base/videos/jobs/$jobId",
  "$base/video/$jobId",
  "$base/generations/$jobId",
  "$base/video-generations/$jobId",
  "$base/videos?id=$jobId",
  "$base/videos",
  "$base/async/videos/$jobId"
)
foreach ($alt in $alts) {
  $hdr = Join-Path $env:TEMP "or-hdr.txt"
  $body = curl.exe -sS -D $hdr "$alt" -H "Authorization: Bearer $env:OPENROUTER_API_KEY" 2>&1
  $status = (Get-Content $hdr -TotalCount 1) -replace '^HTTP/\S+\s+', ''
  $bodyShort = if ($body.Length -gt 200) { $body.Substring(0,200) + '...' } else { $body }
  Write-Host "--- $alt" -ForegroundColor DarkGray
  Write-Host "    $status"
  Write-Host "    $bodyShort"
}
