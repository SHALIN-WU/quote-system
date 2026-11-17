# 物流報價系統 — 只在這台電腦開啟
# 在本資料夾的 PowerShell 執行：
#   powershell -ExecutionPolicy Bypass -File .\start.ps1
# 瀏覽器會開啟 http://127.0.0.1:8080/ （若被占用則改 8081）
# 按 Ctrl+C 停止。

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Test-PortFree([int] $Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $opened = $wait.AsyncWaitHandle.WaitOne(300, $false)
    if (-not $opened) { return $true }
    try { $client.EndConnect($wait) } catch { return $true }
    return $false
  } catch {
    return $true
  } finally {
    $client.Close()
  }
}

$port = 8080
if (-not (Test-PortFree $port)) { $port = 8081 }
if (-not (Test-PortFree $port)) {
  Write-Host "8080 和 8081 都被占用，請先關掉佔用的程式。"
  Read-Host "按 Enter 結束"
  exit 1
}

$url = "http://127.0.0.1:$port/"

function Find-Python {
  $candidates = @(
    @{ Name = "py"; Prefix = @("-3") },
    @{ Name = "python"; Prefix = @() },
    @{ Name = "python3"; Prefix = @() }
  )
  foreach ($item in $candidates) {
    $cmd = Get-Command $item.Name -ErrorAction SilentlyContinue
    if (-not $cmd) { continue }
    if ($cmd.Source -like "*\WindowsApps\*") { continue }
    $check = @()
    $check += $item.Prefix
    $check += @("-c", "import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)")
    & $cmd.Source @check
    if ($LASTEXITCODE -eq 0) {
      return @{ Exe = $cmd.Source; Prefix = $item.Prefix }
    }
  }
  return $null
}

function Start-LocalBrowser([string] $Target) {
  Start-Process $Target
}

$python = Find-Python
if ($python) {
  $helpArgs = @()
  $helpArgs += $python.Prefix
  $helpArgs += @("-m", "http.server", "--help")
  $helpText = & $python.Exe @helpArgs 2>&1 | Out-String
  if ($helpText -match "--bind") {
    Write-Host "啟動 $url"
    Write-Host "按 Ctrl+C 停止伺服器。"
    Start-LocalBrowser $url
    $serve = @()
    $serve += $python.Prefix
    $serve += @("-m", "http.server", "$port", "--bind", "127.0.0.1")
    & $python.Exe @serve
    exit $LASTEXITCODE
  }
}

Write-Host "改用 PowerShell 本機伺服器。"
Write-Host "啟動 $url"
Write-Host "按 Ctrl+C 停止伺服器。"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  Write-Host "無法啟動伺服器：$($_.Exception.Message)"
  Read-Host "按 Enter 結束"
  exit 1
}

Start-LocalBrowser $url

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".ico"  = "image/x-icon"
  ".map"  = "application/json; charset=utf-8"
}

$rootFull = [System.IO.Path]::GetFullPath($root)
if (-not $rootFull.EndsWith("\")) { $rootFull = $rootFull + "\" }

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
      if ([string]::IsNullOrWhiteSpace($path) -or $path -eq "/") { $path = "/index.html" }
      $rel = $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
      $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
      if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $context.Response.StatusCode = 403
        $context.Response.Close()
        continue
      }
      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $missing = [System.Text.Encoding]::UTF8.GetBytes("404")
        $context.Response.OutputStream.Write($missing, 0, $missing.Length)
        $context.Response.Close()
        continue
      }
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $contentType = $types[$ext]
      if (-not $contentType) { $contentType = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $context.Response.StatusCode = 200
      $context.Response.ContentType = $contentType
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $context.Response.Close()
    } catch {
      try { $context.Response.Abort() } catch { }
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
