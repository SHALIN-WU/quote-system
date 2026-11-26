# 物流報價後台 — 本機 Pages Functions + D1
# 在這個資料夾的 PowerShell 執行：
#   powershell -ExecutionPolicy Bypass -File .\start.ps1
# 瀏覽器會開啟 http://127.0.0.1:8080/login
# 127.0.0.1 也要登入。按 Ctrl+C 停止。

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$env:NODE_OPTIONS = "--use-system-ca"
$nodeHome = "C:\Users\user\AppData\Local\nodejs-portable\node-v24.22.1-win-x64"
$node = Join-Path $nodeHome "node.exe"
$npx = Join-Path $nodeHome "npx.cmd"
$npm = Join-Path $nodeHome "npm.cmd"

if (-not (Test-Path -LiteralPath $npx) -or -not (Test-Path -LiteralPath $node)) {
  Write-Host "找不到可攜版 Node：$npx"
  Read-Host "按 Enter 結束"
  exit 1
}

$env:PATH = "$nodeHome;" + $env:PATH

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\wrangler"))) {
  Write-Host "安裝本機工具…"
  & $npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "建立本機資料表…"
& $npx wrangler d1 migrations apply quote-admin --local -y
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$vars = Join-Path $root ".dev.vars"
if (-not (Test-Path -LiteralPath $vars)) {
  Write-Host "本機資料表已建好。請先建立 .dev.vars（不會進 Git），可參考 dev.vars.example。"
  Write-Host "內容需要這三行（密碼請自己填，不要寫在指令裡）："
  Write-Host "  COOKIE_SECURE=false"
  Write-Host "  SESSION_SECRET=至少 16 字元的隨機字串"
  Write-Host "  ADMIN_PASSWORD=第一個管理員的密碼（至少 8 碼）"
  Write-Host "第一個管理員帳號是 admin。使用者資料表是空的時，第一次登入才會建立這個帳號。"
  Read-Host "按 Enter 結束"
  exit 1
}

Write-Host "整理靜態檔…"
& $node (Join-Path $root "scripts\prepare-dist.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$url = "http://127.0.0.1:8080/login"
Write-Host "啟動 $url"
Write-Host "按 Ctrl+C 停止。"
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
  "-NoProfile",
  "-Command",
  "Start-Sleep -Seconds 3; Start-Process '$url'"
)
& $npx wrangler pages dev dist --d1=DB --ip 127.0.0.1 --port 8080
exit $LASTEXITCODE
