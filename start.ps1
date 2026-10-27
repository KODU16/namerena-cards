$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$port = 8123
$url = "http://127.0.0.1:$port/"

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
if (-not $py) {
    Write-Host "没有找到 Python。请安装 Python 3，或手动用任何静态服务器打开本目录。" -ForegroundColor Red
    exit 1
}

# 已经有服务在跑就直接开浏览器
try {
    $probe = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    if ($probe.StatusCode -eq 200) {
        Write-Host "服务器已在运行：$url"
        Start-Process $url
        exit 0
    }
} catch { }

Write-Host "启动静态服务器：$url"
Start-Process -FilePath $py.Source -ArgumentList "-m", "http.server", "$port", "--bind", "127.0.0.1" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
    $check = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    if ($check.StatusCode -ne 200) { throw "HTTP $($check.StatusCode)" }
} catch {
    Write-Host "服务器没起来：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "可以手动执行：`"$($py.Source)`" -m http.server $port --bind 127.0.0.1"
    exit 1
}

Write-Host "已就绪，正在打开浏览器。"
Start-Process $url
