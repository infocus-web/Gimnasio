# Instala el intermediario del lector en esta PC (Windows).
#   1. Instala pyzk dentro de la carpeta (subcarpeta "lib"), sin tocar el resto de Python.
#   2. Crea una tarea programada que lo arranca con Windows (aunque nadie inicie sesión)
#      y lo reinicia si se cae.
# Ejecutar en PowerShell COMO ADMINISTRADOR, dentro de esta carpeta:
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $aqui

if (-not (Test-Path "$aqui\config.json")) {
  Write-Host "Falta config.json: copiá config.ejemplo.json como config.json y completalo." -ForegroundColor Red
  exit 1
}

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { Write-Host "No encuentro Python. Instalalo desde python.org (marcando 'Add to PATH')." -ForegroundColor Red; exit 1 }
$pythonw = Join-Path (Split-Path $python) 'pythonw.exe'
if (-not (Test-Path $pythonw)) { $pythonw = $python }

Write-Host "Instalando pyzk en $aqui\lib ..."
& $python -m pip install --upgrade --target "$aqui\lib" -r "$aqui\requirements.txt" | Out-Null

Write-Host "Probando un ciclo (conexión al lector y a la plataforma)..."
& $python "$aqui\agente.py" --una-vez
if ($LASTEXITCODE -ne 0) { Write-Host "La prueba falló: revisá el mensaje de arriba y agente.log." -ForegroundColor Red; exit 1 }

$nombre = 'Evolution - Intermediario lector'
$accion = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$aqui\agente.py`"" -WorkingDirectory $aqui
$inicio = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$usuario = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $inicio -Settings $ajustes -Principal $usuario -Force | Out-Null
Start-ScheduledTask -TaskName $nombre

Write-Host ""
Write-Host "Listo: el intermediario quedó corriendo y arranca solo con Windows." -ForegroundColor Green
Write-Host "Registro de lo que hace: $aqui\agente.log"
Write-Host "Para detenerlo:  Stop-ScheduledTask -TaskName '$nombre'"
Write-Host "Para quitarlo:   Unregister-ScheduledTask -TaskName '$nombre' -Confirm:`$false"
