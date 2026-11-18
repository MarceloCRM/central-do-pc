<#
  Instala os sensores da Central do PC: as temperaturas aparecem na central sem precisar deixar
  o LibreHardwareMonitor aberto. Precisa de administrador. Rode uma vez em cada PC:

    powershell -ExecutionPolicy Bypass -File agent\install-sensores.ps1

  Para remover:

    powershell -ExecutionPolicy Bypass -File agent\install-sensores.ps1 -Remove

  Baixa o LibreHardwareMonitor e, se faltar, o PawnIO (driver que lê a CPU) das releases oficiais,
  e confere o hash de cada um. Sem internet, passe os arquivos com -LhmZip e -PawnIoSetup.
#>
param(
  [switch]$Remove,
  [string]$LhmZip,
  [string]$PawnIoSetup,
  [string]$LhmUrl = 'https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.6/LibreHardwareMonitor.zip',
  [string]$LhmSha256 = '086d9f1b5a99e643edc2cfaaac16051685b551e4c5ac0b32a57c58c0e529c001',
  [string]$PawnIoUrl = 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe',
  [string]$PawnIoSha256 = '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032'
)

$ErrorActionPreference = 'Stop'
$Target = Join-Path $env:ProgramData 'CentralPC'
$TaskName = 'Central do PC - Sensores'
$Sid = @{ System = '*S-1-5-18'; Admins = '*S-1-5-32-544'; Users = '*S-1-5-32-545' }

function Step($text) { Write-Host "==> $text" }

function Run-Icacls {
  & icacls.exe @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls falhou ($LASTEXITCODE): $($args -join ' ')" }
}

# Usa o arquivo informado ou baixa da release oficial. Em qualquer caso, o hash precisa bater.
function Get-Verified([string]$Given, [string]$Url, [string]$Sha256) {
  $path = $Given
  if (-not $path) {
    $path = Join-Path $env:TEMP ([IO.Path]::GetFileName($Url))
    Step "Baixando $Url"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Url -OutFile $path -UseBasicParsing
  }
  $got = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($got -ne $Sha256) { throw "Hash incorreto em $path (esperado $Sha256, veio $got)" }
  return $path
}

$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Execute como administrador.' }

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2   # libera as DLLs da pasta lhm
}

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
  Step 'Sensores removidos. O PawnIO continua instalado (remova em Aplicativos instalados, se quiser).'
  return
}

# Pasta protegida: o SYSTEM grava, a conta comum só lê. Assim o agente confia no que lê ali.
Step "Copiando para $Target"
foreach ($d in $Target, "$Target\lhm") {
  if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}
Run-Icacls $Target /inheritance:r /grant:r "$($Sid.System):(OI)(CI)F" "$($Sid.Admins):(OI)(CI)F" "$($Sid.Users):(OI)(CI)RX"
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'sensors.ps1') -Destination $Target -Force

# Só as DLLs que a biblioteca usa, sem a interface gráfica.
$zipPath = Get-Verified $LhmZip $LhmUrl $LhmSha256
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  foreach ($e in $zip.Entries) {
    if ($e.FullName -match '^[^/\\]+\.dll$' -and $e.Name -notmatch '^(Aga\.Controls|OxyPlot|Microsoft\.Win32\.TaskScheduler)') {
      [IO.Compression.ZipFileExtensions]::ExtractToFile($e, "$Target\lhm\$($e.Name)", $true)
    }
  }
} finally {
  $zip.Dispose()
}
Step 'LibreHardwareMonitor copiado'

if (Get-Service -Name PawnIO -ErrorAction SilentlyContinue) {
  Step 'PawnIO já instalado'
} else {
  $setup = Get-Verified $PawnIoSetup $PawnIoUrl $PawnIoSha256
  $sig = Get-AuthenticodeSignature -LiteralPath $setup
  if ($sig.Status -ne 'Valid') { throw "Assinatura do PawnIO inválida: $($sig.Status)" }
  $p = Start-Process -FilePath $setup -ArgumentList '-install', '-silent' -Wait -PassThru
  Step "PawnIO instalado (código $($p.ExitCode))"
}

# Começa no boot, antes de alguém entrar no Windows, e volta sozinha se cair.
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Target\sensors.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Step "Tarefa '$TaskName' registrada e iniciada"

Start-Sleep -Seconds 8
$log = "$Target\sensors.log"
if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 3 -Encoding UTF8 | ForEach-Object { Write-Host "    $_" } }
