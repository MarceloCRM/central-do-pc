# Sensores da Central do PC. Roda como SYSTEM desde o boot (tarefa "Central do PC - Sensores"),
# porque ler a temperatura da CPU exige administrador (driver PawnIO). A cada 5 segundos grava as
# temperaturas em sensors.json, que o agente (sem privilégios) só lê. Não acessa a rede.
#
# Instalado por install-sensores.ps1 em C:\ProgramData\CentralPC, pasta que a conta comum lê
# mas não altera.
param([string]$BaseDir = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
$Out = Join-Path $BaseDir 'sensors.json'
$Log = Join-Path $BaseDir 'sensors.log'
$Lhm = Join-Path $BaseDir 'lhm'
$script:LastError = $null

function Write-Log([string]$Text) {
  try {
    if ((Test-Path -LiteralPath $Log) -and (Get-Item -LiteralPath $Log).Length -gt 256KB) {
      Move-Item -LiteralPath $Log -Destination "$Log.old" -Force
    }
    Add-Content -LiteralPath $Log -Encoding UTF8 -Value "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) $Text"
  } catch {}
}

# Os componentes do LibreHardwareMonitor esperam versões específicas de suas dependências.
# Sem o arquivo .config de um .exe próprio, é este resolvedor que as encontra na pasta lhm.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Reflection;
namespace CentralPc {
  public static class Resolver {
    static string dir;
    public static void Register(string d) {
      dir = d;
      AppDomain.CurrentDomain.AssemblyResolve += (s, a) => {
        string p = Path.Combine(dir, new AssemblyName(a.Name).Name + ".dll");
        return File.Exists(p) ? Assembly.LoadFrom(p) : null;
      };
    }
  }
}
'@
[CentralPc.Resolver]::Register($Lhm)

$computer = $null
try {
  Add-Type -Path (Join-Path $Lhm 'LibreHardwareMonitorLib.dll')
  $computer = New-Object LibreHardwareMonitor.Hardware.Computer
  $computer.IsCpuEnabled = $true
  $computer.IsGpuEnabled = $true
  $computer.IsStorageEnabled = $true
  $computer.Open()
} catch {
  $inner = $_.Exception
  while ($inner.InnerException) { $inner = $inner.InnerException }
  Write-Log "LibreHardwareMonitor não iniciou: $($inner.Message)"
}

function Get-FirstTemp($Hardware, [string[]]$Preferred) {
  $sensors = @($Hardware.Sensors | Where-Object { "$($_.SensorType)" -eq 'Temperature' -and $null -ne $_.Value -and $_.Value -gt 0 -and $_.Value -lt 150 })
  foreach ($name in $Preferred) {
    $hit = $sensors | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if ($hit) { return $hit.Value }
  }
  if ($sensors.Count -gt 0) { return $sensors[0].Value }
  return $null
}

function Get-Temps {
  $out = @()
  if ($computer) {
    foreach ($hw in $computer.Hardware) {
      $hw.Update()
      $kind = "$($hw.HardwareType)"
      $value = $null
      $label = $hw.Name
      if ($kind -eq 'Cpu') {
        $value = Get-FirstTemp $hw @('Core (Tctl/Tdie)', 'CPU Package', 'Core Average')
        $label = 'CPU'
      } elseif ($kind -like 'Gpu*') {
        $value = Get-FirstTemp $hw @('GPU Core')
        $label = 'GPU'
      } elseif ($kind -eq 'Storage') {
        $value = Get-FirstTemp $hw @('Temperature')
      }
      if ($null -ne $value) { $out += @{ name = "$label".Trim(); c = [math]::Round([double]$value) } }
    }
  }
  # Sem leitura da GPU pelo LibreHardwareMonitor, o nvidia-smi serve de alternativa.
  if (-not ($out | Where-Object { $_.name -eq 'GPU' })) {
    try {
      $smi = & nvidia-smi.exe --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>$null
      if ($LASTEXITCODE -eq 0 -and $smi) { $out += @{ name = 'GPU'; c = [int]@($smi)[0] } }
    } catch {}
  }
  return ,$out
}

Write-Log 'Sensores iniciados'
$noBom = New-Object Text.UTF8Encoding($false)
$first = $true
while ($true) {
  try {
    $temps = Get-Temps
    $json = @{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); temps = $temps } | ConvertTo-Json -Compress -Depth 4
    # Grava ao lado e troca de uma vez: o agente nunca lê um arquivo pela metade.
    [IO.File]::WriteAllText("$Out.tmp", $json, $noBom)
    Move-Item -LiteralPath "$Out.tmp" -Destination $Out -Force
    if ($first) { Write-Log "Temperaturas lidas: $((@($temps) | ForEach-Object { "$($_.name)=$($_.c)" }) -join ', ')"; $first = $false }
    $script:LastError = $null
  } catch {
    if ($_.Exception.Message -ne $script:LastError) { Write-Log "Falha na leitura: $($_.Exception.Message)" }
    $script:LastError = $_.Exception.Message
  }
  Start-Sleep -Seconds 5
}
