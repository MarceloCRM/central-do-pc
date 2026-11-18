<#
  Instala ou atualiza o agente da Central do PC neste computador.

  O agente fica em %LOCALAPPDATA%\CentralPC\agent, fora da pasta do projeto, para
  continuar funcionando mesmo que esta pasta seja movida ou apagada. Rode de novo
  sempre que mudar o agent.js ou o helper.cs: o config.json de lá é preservado.

  Primeira vez. -Pc é o id deste PC na central e -Secret é a chave dele. Os dois vêm prontos no
  comando que a central mostra em Sistema > Computadores > Instalar:
    powershell -ExecutionPolicy Bypass -File install.ps1 -Url https://SEU-WORKER.workers.dev -Pc desktop -Secret CHAVE

  Atualizar:
    powershell -ExecutionPolicy Bypass -File install.ps1

  Não precisa de administrador. Precisa do Node.js 22 ou mais novo.
#>
param(
    [string]$Url,
    [string]$Pc,
    [string]$Secret,
    [string]$Dest = (Join-Path $env:LOCALAPPDATA 'CentralPC\agent'),
    [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$taskName = 'Central do PC - Agente'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'CentralPCAgente'

function Step($text) { Write-Host "==> $text" }

# --- Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw 'Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo.' }
$node = $nodeCmd.Source
$major = [int](& $node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { throw "O agente precisa do Node.js 22 ou mais novo (este é o $major)." }

# --- Para o agente que estiver rodando desta pasta de destino
function Stop-Agent {
    $target = (Join-Path $Dest 'agent.js').ToLower()
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($target) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }
}

Step "Copiando o agente para $Dest"
New-Item -ItemType Directory -Force $Dest | Out-Null
Stop-Agent
Start-Sleep -Milliseconds 800
foreach ($file in 'agent.js', 'helper.cs', 'package.json', 'package-lock.json') {
    Copy-Item -LiteralPath (Join-Path $src $file) -Destination $Dest -Force
}

# --- Ajudante (métricas, print e suspender), compilado com o compilador que já vem no Windows
Step 'Compilando o helper.exe'
$csc = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw 'Não achei o compilador do .NET Framework 4 (csc.exe).' }
& $csc -nologo -optimize+ -target:exe -codepage:65001 "-out:$(Join-Path $Dest 'helper.exe')" `
    -r:System.Management.dll -r:System.Web.Extensions.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll `
    (Join-Path $Dest 'helper.cs')
if ($LASTEXITCODE -ne 0) { throw 'A compilação do helper.cs falhou.' }

# --- Dependência do terminal (node-pty, já vem compilado para Windows)
Step 'Instalando dependências (npm)'
Push-Location $Dest
try {
    & npm.cmd install --omit=dev --no-fund --no-audit --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw 'O npm install falhou.' }
} finally {
    Pop-Location
}

# --- Configuração
$configFile = Join-Path $Dest 'config.json'
$noBom = New-Object System.Text.UTF8Encoding($false)
$oldPc = $null
if (Test-Path $configFile) { $oldPc = (Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json).pc }
if ($Url -or $Pc -or $Secret -or -not $oldPc) {
    $config = [ordered]@{ url = ''; pc = ''; secret = ''; folders = @() }
    if (Test-Path $configFile) {
        $old = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($p in $old.PSObject.Properties) { $config[$p.Name] = $p.Value }
    }
    if ($Url) { $config.url = $Url.TrimEnd('/') }
    if ($Pc) { $config.pc = $Pc.Trim().ToLower() }
    if ($Secret) { $config.secret = $Secret }
    if (-not $config.url) { $config.url = (Read-Host 'Endereço do Worker (https://...workers.dev)').Trim().TrimEnd('/') }
    if (-not $config.pc) { $config.pc = (Read-Host 'Id deste PC na central (Sistema > Computadores)').Trim().ToLower() }
    if (-not $config.secret) { $config.secret = (Read-Host 'Chave deste PC (Sistema > Computadores > Instalar)').Trim() }
    if (-not $config.url -or -not $config.pc -or -not $config.secret) { throw 'Faltou o endereço do Worker, o PC ou a chave dele.' }
    [System.IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json -Depth 5), $noBom)
    Step 'config.json gravado'
} else {
    Step 'config.json existente mantido'
}

$programsFile = Join-Path $Dest 'programs.json'
if (-not (Test-Path $programsFile)) {
    Copy-Item -LiteralPath (Join-Path $src 'programs.example.json') -Destination $programsFile
    Step "programs.json criado (edite para escolher os programas da central): $programsFile"
}

# --- Iniciar junto com o Windows, sem janela.
# "conhost --headless" roda um programa de console sem abrir janela nenhuma.
$agentJs = Join-Path $Dest 'agent.js'
$arguments = "--headless `"$node`" `"$agentJs`""
$registered = $false
try {
    $action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument $arguments -WorkingDirectory $Dest
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    # Notebook: roda na bateria. Sem limite de tempo. Se cair, o Windows sobe de novo em 1 minuto.
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Remove-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue
    $registered = $true
    Step "Tarefa agendada criada: '$taskName' (inicia quando você entra no Windows)"
} catch {
    # Criar tarefa de logon pode exigir administrador. A chave Run do usuário faz o mesmo papel.
    Set-ItemProperty -Path $runKey -Name $runName -Value "conhost.exe $arguments"
    Step "Sem permissão para tarefa agendada: registrado na inicialização do usuário (chave Run)."
}

if (-not $NoStart) {
    Step 'Iniciando o agente'
    if ($registered) { Start-ScheduledTask -TaskName $taskName }
    else { Start-Process -FilePath 'conhost.exe' -ArgumentList $arguments -WorkingDirectory $Dest }
    Start-Sleep -Seconds 4
    $log = Join-Path $Dest 'agent.log'
    if (Test-Path $log) { Get-Content -LiteralPath $log -Tail 4 -Encoding UTF8 | ForEach-Object { Write-Host "    $_" } }
}

Write-Host ''
Write-Host "Pronto. Registro do agente: $(Join-Path $Dest 'agent.log')"
