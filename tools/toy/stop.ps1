$ErrorActionPreference = 'Stop'
# 只停止本目录记录且命令行一致的服务，避免误停其他 Python 进程。
$pidFile = Join-Path $PSScriptRoot 'server.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Host '没有记录中的服务。'; exit 0 }
$serverId = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
$site = Join-Path $PSScriptRoot 'site'
if ($process -and $process.CommandLine.Contains($site) -and $process.CommandLine.Contains('http.server')) {
    Stop-Process -Id $serverId
    Remove-Item -LiteralPath $pidFile
    Write-Host '服务已停止。'
} elseif (!$process) { Remove-Item -LiteralPath $pidFile; Write-Host '服务已经停止。' }
else { throw '进程身份不一致，已拒绝停止。' }
