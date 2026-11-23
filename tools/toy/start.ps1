param([int]$Port = 8131)
$ErrorActionPreference = 'Stop'
# 仅监听本机；后台运行预览服务，不生成假 Bilibili 身份。
$site = Join-Path $PSScriptRoot 'site'
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw "端口 $Port 已被占用，请直接访问或换端口。" }
$python = (Get-Command python).Source
$server = Start-Process -FilePath $python -ArgumentList @('-m','http.server',"$Port",'--bind','127.0.0.1','--directory',('"' + $site + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
$server.Id | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'server.pid') -Encoding ascii
Start-Sleep -Milliseconds 700
if ($server.HasExited) { throw '启动失败，请查看 server-error.log。' }
Write-Host "Cards Toy：http://127.0.0.1:$Port/"
